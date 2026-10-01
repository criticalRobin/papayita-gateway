import type { ExtractedBillingAttempt } from '../../extraction/domain/types';
import type { BillingIssue } from '../../draft-builder/domain/errors';

// Billing correction window: after a billing attempt fails on fixable data
// (cédula/RUC not in SRI, product not in catalog), the user gets up to
// MAX_BILLING_FIX_ATTEMPTS follow-up messages to fix it ("1850137918",
// "era chompa azul") without resending the whole request. Each follow-up
// costs one reply message — this is a deliberate, bounded exception to the
// 2-message budget (project-info.md).
export const MAX_BILLING_FIX_ATTEMPTS = 3;

export interface BillingContext {
  // Latest merged extraction — follow-ups patch this, not the raw text.
  extracted: ExtractedBillingAttempt;
  issues: BillingIssue[];
  // Original message + follow-ups, fed to the LLM refine prompt as context.
  messages: string[];
  // Follow-ups consumed so far (the original message doesn't count).
  attempts: number;
}

export function startBillingContext(
  text: string,
  extracted: ExtractedBillingAttempt,
  issues: BillingIssue[],
): BillingContext {
  return { extracted, issues, messages: [text], attempts: 0 };
}

export function recordBillingAttempt(
  context: BillingContext,
  text: string,
  extracted: ExtractedBillingAttempt,
  issues: BillingIssue[],
): BillingContext {
  return {
    extracted,
    issues,
    messages: [...context.messages, text],
    attempts: context.attempts + 1,
  };
}

export function isBillingContextExhausted(context: BillingContext): boolean {
  return context.attempts >= MAX_BILLING_FIX_ATTEMPTS;
}

export function remainingBillingAttempts(context: BillingContext): number {
  return Math.max(MAX_BILLING_FIX_ATTEMPTS - context.attempts, 0);
}
