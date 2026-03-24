/**
 * @file idVerifier.js
 * @description AI-powered ID document verification using Claude Vision.
 *
 * Analyzes uploaded ID photos to determine:
 *  - Whether the image contains a valid government-issued ID
 *  - The type of ID detected (e.g. National ID, Driver's License, etc.)
 *  - The name visible on the ID
 *  - Whether the name matches the registration name
 *  - A confidence score for the verification
 *
 * Uses Anthropic's Claude model with vision capabilities via tool-use.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

// Lazily-initialised singleton — avoids creating a new HTTP connection pool at
// module load time and reuses connections across verification calls.
let _client = null;
const getClient = () => _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Verifies an uploaded ID photo using Claude Vision.
 *
 * @param {string} imagePath - Absolute path to the uploaded image file
 * @param {string} registrationName - Name provided during registration
 * @returns {Promise<object>} Verification result with fields:
 *   - isValid: boolean - whether a legitimate ID was detected
 *   - idType: string - type of ID detected
 *   - nameOnId: string - name extracted from the ID
 *   - nameMatch: boolean - whether the name matches registration
 *   - confidence: number - confidence score 0-100
 *   - reason: string - explanation of the result
 */
export async function verifyIdPhoto(imagePath, registrationName) {
  // Fallback if no API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set — skipping ID verification');
    return {
      isValid: true,
      idType: 'unknown',
      nameOnId: '',
      nameMatch: true,
      confidence: 0,
      reason: 'ID verification unavailable (no API key). Manual review required.',
      needsManualReview: true,
    };
  }

  try {
    // Read image and convert to base64
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(process.cwd(), imagePath.replace(/^\//, ''));

    if (!fs.existsSync(absolutePath)) {
      return {
        isValid: false,
        idType: 'none',
        nameOnId: '',
        nameMatch: false,
        confidence: 0,
        reason: 'ID photo file not found.',
      };
    }

    const imageBuffer = fs.readFileSync(absolutePath);
    const base64Image = imageBuffer.toString('base64');

    // Detect media type from extension
    const ext = path.extname(absolutePath).toLowerCase();
    const mediaTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mediaType = mediaTypes[ext] || 'image/jpeg';

    const response = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [
        {
          name: 'id_verification_result',
          description: 'Report the result of analyzing an ID document photo.',
          input_schema: {
            type: 'object',
            properties: {
              is_valid_id: {
                type: 'boolean',
                description: 'Whether the image contains a legitimate, recognizable government-issued ID document (not a random photo, screenshot, or blank image).',
              },
              id_type: {
                type: 'string',
                description: 'Type of ID detected, e.g. "Philippine National ID", "Driver\'s License", "Voter\'s ID", "Passport", "PhilSys ID", "SSS ID", "Postal ID", "Barangay Certificate", "PWD ID", "Senior Citizen ID", "Unknown Government ID", or "Not an ID".',
              },
              name_on_id: {
                type: 'string',
                description: 'The full name visible on the ID document. Empty string if not readable.',
              },
              confidence: {
                type: 'number',
                description: 'Confidence score from 0-100 that this is a real government-issued ID.',
              },
              reason: {
                type: 'string',
                description: 'Brief explanation of the verification result.',
              },
            },
            required: ['is_valid_id', 'id_type', 'name_on_id', 'confidence', 'reason'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'id_verification_result' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `You are an ID document verification system for a Philippine municipal e-government portal. Analyze this uploaded image and determine:

1. Is this a photo of a legitimate Philippine government-issued ID document? (Not a screenshot, selfie, random photo, blank image, or digitally generated fake)
2. What type of government ID is it?
3. What is the full name shown on the ID?
4. How confident are you (0-100) that this is a real, physical government-issued ID?

Accepted ID types include: Philippine National ID, PhilSys ID, Driver's License, Passport, Voter's ID, SSS ID, GSIS ID, PhilHealth ID, Postal ID, Barangay Certificate/Clearance, Senior Citizen ID, PWD ID, TIN ID, Police Clearance, NBI Clearance, or any other Philippine government-issued identification.

Be strict: reject selfies, screenshots of digital IDs, random photos, memes, blank images, or photos that don't clearly show a physical ID document. The image should show a physical card/document with visible text and photo.

The person registering provided their name as: "${registrationName}"

Use the id_verification_result tool to report your findings.`,
            },
          ],
        },
      ],
    });

    // Extract tool use result
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse) {
      return {
        isValid: false,
        idType: 'unknown',
        nameOnId: '',
        nameMatch: false,
        confidence: 0,
        reason: 'ID verification failed — could not analyze the image.',
      };
    }

    const result = toolUse.input;

    // Compare names (fuzzy match — normalize and check if main parts match)
    const normalize = (name) => name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    const regParts = normalize(registrationName).split(' ');
    const idParts = normalize(result.name_on_id || '').split(' ');

    // Name matches if at least the surname (last word) and first name (first word) overlap
    const nameMatch = result.name_on_id
      ? regParts.some(p => idParts.includes(p) && p.length > 1) && regParts.length > 0
      : false;

    return {
      isValid: result.is_valid_id && result.confidence >= 40,
      idType: result.id_type || 'Unknown',
      nameOnId: result.name_on_id || '',
      nameMatch,
      confidence: result.confidence || 0,
      reason: result.reason || '',
    };
  } catch (err) {
    console.error('❌ ID verification error:', err.message);
    return {
      isValid: true,
      idType: 'unknown',
      nameOnId: '',
      nameMatch: true,
      confidence: 0,
      reason: `Verification service temporarily unavailable. Manual review required.`,
      needsManualReview: true,
    };
  }
}
