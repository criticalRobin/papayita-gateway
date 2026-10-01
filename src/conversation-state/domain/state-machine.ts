import type { BillingContext } from './billing-context';

export type ConversationState =
  'idle' | 'awaiting_billing_fix' | 'awaiting_webview_action' | 'submitting';

export interface ConversationRecord {
  state: ConversationState;
  pendingDocument: unknown;
  correlationId: string | null;
  // Only set while state === 'awaiting_billing_fix'.
  billingContext: BillingContext | null;
  updatedAt: string;
}

export type ConversationEvent =
  | { type: 'BILLING_INCOMPLETE'; context: BillingContext }
  | { type: 'BILLING_CONTEXT_CLEARED' }
  | { type: 'DRAFT_READY'; correlationId: string; draft: unknown }
  | { type: 'WEBVIEW_CONFIRMED' }
  | { type: 'WEBHOOK_RECEIVED' };

export function createIdleRecord(): ConversationRecord {
  return {
    state: 'idle',
    pendingDocument: null,
    correlationId: null,
    billingContext: null,
    updatedAt: new Date(0).toISOString(),
  };
}

// Pure state machine per coding-guide.md / project-info.md's webview-era design:
//   idle -> (billing attempt classified, draft built, CTA sent) -> awaiting_webview_action
//   idle -> (billing attempt has fixable issues) -> awaiting_billing_fix
//   awaiting_billing_fix -> (follow-up still has issues) -> awaiting_billing_fix   [context updated]
//   awaiting_billing_fix -> (follow-up resolves it, CTA sent) -> awaiting_webview_action
//   awaiting_billing_fix -> (window exhausted / cancelled) -> idle
//   awaiting_billing_fix -> (context TTL expires) -> idle   [Redis TTL, no explicit transition]
//   awaiting_webview_action -> (user submits via webview) -> submitting
//   awaiting_webview_action -> (exchange code expires unused) -> idle   [Redis TTL, no explicit transition]
//   submitting -> (webhook success/failure) -> idle
//
// No correction-loop cap: editing now happens inside the webview session before
// confirmation (zero WhatsApp message cost per edit), so the state machine doesn't
// represent it at all.
export function transition(
  record: ConversationRecord,
  event: ConversationEvent,
): ConversationRecord {
  switch (event.type) {
    case 'BILLING_INCOMPLETE':
      if (record.state !== 'idle' && record.state !== 'awaiting_billing_fix') {
        return record;
      }
      return {
        ...record,
        state: 'awaiting_billing_fix',
        billingContext: event.context,
      };

    case 'BILLING_CONTEXT_CLEARED':
      if (record.state !== 'awaiting_billing_fix') {
        return record;
      }
      return { ...record, state: 'idle', billingContext: null };

    case 'DRAFT_READY':
      if (record.state !== 'idle' && record.state !== 'awaiting_billing_fix') {
        return record;
      }
      return {
        ...record,
        state: 'awaiting_webview_action',
        correlationId: event.correlationId,
        pendingDocument: event.draft,
        billingContext: null,
      };

    case 'WEBVIEW_CONFIRMED':
      if (record.state !== 'awaiting_webview_action') {
        return record;
      }
      return { ...record, state: 'submitting' };

    case 'WEBHOOK_RECEIVED':
      if (record.state !== 'submitting') {
        return record;
      }
      return {
        ...record,
        state: 'idle',
        pendingDocument: null,
        correlationId: null,
      };
  }
}
