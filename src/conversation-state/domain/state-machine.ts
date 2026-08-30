export type ConversationState =
  'idle' | 'awaiting_webview_action' | 'submitting';

export interface ConversationRecord {
  state: ConversationState;
  pendingDocument: unknown;
  correlationId: string | null;
  updatedAt: string;
}

export type ConversationEvent =
  | { type: 'DRAFT_READY'; correlationId: string; draft: unknown }
  | { type: 'WEBVIEW_CONFIRMED' }
  | { type: 'WEBHOOK_RECEIVED' };

export function createIdleRecord(): ConversationRecord {
  return {
    state: 'idle',
    pendingDocument: null,
    correlationId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

// Pure state machine per coding-guide.md / project-info.md's webview-era design:
//   idle -> (billing attempt classified, draft built, CTA sent) -> awaiting_webview_action
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
    case 'DRAFT_READY':
      if (record.state !== 'idle') {
        return record;
      }
      return {
        ...record,
        state: 'awaiting_webview_action',
        correlationId: event.correlationId,
        pendingDocument: event.draft,
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
