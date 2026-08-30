import { ExtractionParseError } from '../extraction.errors';
import {
  ExtractedBillingAttempt,
  extractedBillingAttemptSchema,
} from './types';

const FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = FENCE_PATTERN.exec(trimmed);
  return match ? match[1] : trimmed;
}

export function parseExtractionResponse(raw: string): ExtractedBillingAttempt {
  const stripped = stripMarkdownFence(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new ExtractionParseError('LLM output was not valid JSON');
  }

  const result = extractedBillingAttemptSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionParseError(
      `LLM output did not match the expected schema: ${result.error.message}`,
    );
  }

  return result.data;
}
