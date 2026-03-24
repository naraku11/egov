/**
 * @file classifier.js
 * @description AI-powered (with local fallback) department-classification service.
 *
 * Determines which municipal department should handle a resident's concern by
 * analysing the free-text submission.  Two classification strategies are used,
 * with automatic fallback:
 *
 *  1. **Claude AI (primary)** – Sends the concern text to Anthropic's
 *     `claude-haiku-4-5` model via tool-use, which returns a structured
 *     `{ department_code, confidence }` object.  Requires the
 *     `ANTHROPIC_API_KEY` environment variable to be set.
 *
 *  2. **Keyword matching (fallback)** – A local, zero-dependency algorithm that
 *     scores each active department by how many of its stored keywords appear in
 *     the concern text.  Used automatically when no API key is configured or
 *     when the Claude call fails.
 *
 * The public export `classifyConcern` is the only function route handlers need
 * to call.  It returns a normalised result object regardless of which strategy
 * was used.
 */

import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma.js';

// ── Claude Haiku: fast, cheap, accurate enough for department classification ─

/**
 * Classifies a resident concern using the Anthropic Claude API (tool-use mode).
 *
 * The model is constrained to call the `classify_concern` tool, which forces it
 * to return a machine-readable `{ department_code, confidence }` payload rather
 * than a freeform text reply.
 *
 * @param {string}   text        - The raw concern text submitted by the resident.
 * @param {object[]} departments - Active department records from the database.
 *   Each record should have at least `{ id, code, name, description?, keywords? }`.
 * @returns {Promise<{ department_code: string, confidence: number }>}
 *   The tool's structured output: department code and a 0–1 confidence score.
 * @throws {Error} If Claude does not return a `tool_use` content block.
 */
// Lazily-initialised singleton — avoids creating a new HTTP connection pool on
// every classification call, which was exhausting memory on shared hosting.
let _client = null;
const getClient = () => _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const classifyWithClaude = async (text, departments) => {
  const client = getClient();

  // Build a human-readable department list for the prompt, optionally including
  // description and keywords so Claude can make a more informed decision.
  const deptList = departments.map(d => {
    const kw = Array.isArray(d.keywords) ? d.keywords.join(', ') : '';
    return `- ${d.code}: ${d.name}${d.description ? ' — ' + d.description : ''}${kw ? ' (keywords: ' + kw + ')' : ''}`;
  }).join('\n');

  // Call Claude with tool_choice forced to our single classification tool so
  // the model always returns structured output rather than plain text.
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    tool_choice: { type: 'tool', name: 'classify_concern' }, // Force tool use.
    tools: [{
      name: 'classify_concern',
      description: 'Classify a resident concern into the most appropriate municipal department',
      input_schema: {
        type: 'object',
        properties: {
          department_code: {
            type: 'string',
            // Restrict the model to only valid codes present in the database.
            enum: departments.map(d => d.code),
            description: 'Code of the most appropriate department',
          },
          confidence: {
            type: 'number',
            description: 'Confidence score 0.0 – 1.0',
          },
        },
        required: ['department_code', 'confidence'],
        additionalProperties: false,
      },
    }],
    messages: [{
      role: 'user',
      content: `You are classifying municipal government concerns for the Municipality of Aloguinsan, Cebu, Philippines.

Available departments:
${deptList}

Resident's concern:
"${text}"

Classify this concern into the single most appropriate department.`,
    }],
  });

  // Locate the tool_use block in the response content array.
  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use block returned by Claude');

  // Return the structured input the model passed to the tool.
  return toolUse.input;
};

// ── Local keyword fallback (no API key required) ──────────────────────────

/**
 * Classifies a concern using a simple keyword-frequency scoring algorithm.
 *
 * For each active department the function counts how many of the department's
 * stored keywords appear in the lower-cased concern text, weighting longer
 * keywords more heavily (score += keyword.length on each match).  The
 * department with the highest score wins.
 *
 * If no department keyword matches, the function falls back to the 'MAYORS'
 * office (or the first available department) with a neutral 0.5 confidence.
 *
 * @param {string}   text        - The raw concern text submitted by the resident.
 * @param {object[]} departments - Active department records from the database.
 * @returns {{ department_code: string, confidence: number }}
 *   Best-matching department code and an estimated confidence score.
 */
const classifyLocally = (text, departments) => {
  const lowerText = text.toLowerCase(); // Normalise once for all comparisons.
  let bestMatch = null;
  let bestScore = 0;

  for (const dept of departments) {
    // Guard against departments that have no keywords stored yet.
    const keywords = Array.isArray(dept.keywords) ? dept.keywords : [];
    let score = 0;

    for (const kw of keywords) {
      // Award points proportional to keyword length so multi-word phrases
      // outweigh single short words (e.g. "road repair" > "road").
      if (lowerText.includes(kw.toLowerCase())) score += kw.length;
    }

    // Track the department with the highest cumulative keyword score.
    if (score > bestScore) { bestScore = score; bestMatch = dept; }
  }

  if (bestMatch && bestScore > 0) {
    // Cap confidence at 0.95; normalise roughly against a "perfect" score of 20.
    return { department_code: bestMatch.code, confidence: Math.min(0.95, bestScore / 20) };
  }

  // No keyword matched – route to the Mayor's office as the default catch-all.
  const mayors = departments.find(d => d.code === 'MAYORS');
  return { department_code: mayors?.code || departments[0]?.code, confidence: 0.5 };
};

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Determines the most appropriate department for a resident's concern.
 *
 * Attempts Claude AI classification first (when `ANTHROPIC_API_KEY` is set).
 * If the API key is absent or the Claude call throws, the local keyword
 * algorithm is used as a transparent fallback.
 *
 * @param {string} text - Free-text concern submitted by the resident.
 * @returns {Promise<{
 *   departmentId:   string | undefined,
 *   departmentCode: string,
 *   confidence:     number,
 *   method:         'claude-ai' | 'local'
 * }>} Classification result including which strategy was used.
 */
export const classifyConcern = async (text) => {
  // Fetch all departments that are currently active in the system.
  const departments = await prisma.department.findMany({ where: { isActive: true } });

  // Prefer the AI classifier when an API key is available.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await classifyWithClaude(text, departments);

      // Resolve the full department record so we can return its database ID.
      const dept = departments.find(d => d.code === result.department_code);
      return {
        departmentId: dept?.id,
        departmentCode: result.department_code,
        confidence: result.confidence,
        method: 'claude-ai',  // Indicate AI was used for transparency/logging.
      };
    } catch (err) {
      // Non-fatal: log the failure and let execution fall through to the local
      // classifier rather than surfacing an error to the caller.
      console.error('Claude classifier error, falling back to local:', err.message);
    }
  }

  // Either no API key is configured or Claude failed – use keyword matching.
  const result = classifyLocally(text, departments);
  const dept = departments.find(d => d.code === result.department_code);
  return {
    departmentId: dept?.id,
    departmentCode: result.department_code,
    confidence: result.confidence,
    method: 'local',  // Indicate the fallback strategy was used.
  };
};
