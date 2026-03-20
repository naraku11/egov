import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma.js';

// ── Claude Haiku: fast, cheap, accurate enough for department classification ─
const classifyWithClaude = async (text, departments) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const deptList = departments.map(d => {
    const kw = Array.isArray(d.keywords) ? d.keywords.join(', ') : '';
    return `- ${d.code}: ${d.name}${d.description ? ' — ' + d.description : ''}${kw ? ' (keywords: ' + kw + ')' : ''}`;
  }).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    tool_choice: { type: 'tool', name: 'classify_concern' },
    tools: [{
      name: 'classify_concern',
      description: 'Classify a resident concern into the most appropriate municipal department',
      input_schema: {
        type: 'object',
        properties: {
          department_code: {
            type: 'string',
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
      content: `You are classifying municipal government concerns for the Municipality of Aluguinsan, Cebu, Philippines.

Available departments:
${deptList}

Resident's concern:
"${text}"

Classify this concern into the single most appropriate department.`,
    }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use block returned by Claude');
  return toolUse.input;
};

// ── Local keyword fallback (no API key required) ──────────────────────────
const classifyLocally = (text, departments) => {
  const lowerText = text.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const dept of departments) {
    const keywords = Array.isArray(dept.keywords) ? dept.keywords : [];
    let score = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw.toLowerCase())) score += kw.length;
    }
    if (score > bestScore) { bestScore = score; bestMatch = dept; }
  }

  if (bestMatch && bestScore > 0) {
    return { department_code: bestMatch.code, confidence: Math.min(0.95, bestScore / 20) };
  }
  const mayors = departments.find(d => d.code === 'MAYORS');
  return { department_code: mayors?.code || departments[0]?.code, confidence: 0.5 };
};

// ── Public API ────────────────────────────────────────────────────────────
export const classifyConcern = async (text) => {
  const departments = await prisma.department.findMany({ where: { isActive: true } });

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await classifyWithClaude(text, departments);
      const dept = departments.find(d => d.code === result.department_code);
      return {
        departmentId: dept?.id,
        departmentCode: result.department_code,
        confidence: result.confidence,
        method: 'claude-ai',
      };
    } catch (err) {
      console.error('Claude classifier error, falling back to local:', err.message);
    }
  }

  const result = classifyLocally(text, departments);
  const dept = departments.find(d => d.code === result.department_code);
  return {
    departmentId: dept?.id,
    departmentCode: result.department_code,
    confidence: result.confidence,
    method: 'local',
  };
};
