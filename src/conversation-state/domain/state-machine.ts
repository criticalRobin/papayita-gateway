export type ConversationState =
  'idle' | 'awaiting_confirmation' | 'submitting' | 'escalated';

export interface ConversationRecord {
  state: ConversationState;
  correctionCount: number;
  pendingDocument: unknown | null;
  // Core API correlation id — unused until core-api client exists.
  correlationId: string | null;
  // Stamped by the service on save; transition() never reads the clock so it
  // stays a plain, deterministic function (data in, data out).
  updatedAt: string;
}

export type ConversationEvent =
  | { type: 'BILLING_ATTEMPT_PARSED'; draft: unknown }
  | { type: 'USER_CONFIRMED' }
  | { type: 'USER_CORRECTED'; draft: unknown }
  | { type: 'WEBHOOK_RECEIVED' };

export function createIdleRecord(): ConversationRecord {
  return {
    state: 'idle',
    correctionCount: 0,
    pendingDocument: null,
    correlationId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

// Pure state machine per project-info.md:
//   idle -> (billing attempt parsed) -> awaiting_confirmation
//   awaiting_confirmation -> (user confirms) -> submitting
//   awaiting_confirmation -> (correction, correctionCount == 0) -> awaiting_confirmation (correctionCount = 1)
//   awaiting_confirmation -> (still wrong, correctionCount == 1) -> escalated
//   submitting -> (webhook received) -> idle
export function transition(
  record: ConversationRecord,
  event: ConversationEvent,
): ConversationRecord {
  switch (event.type) {
    case 'BILLING_ATTEMPT_PARSED':
      if (record.state !== 'idle') {
        return record;
      }
      return {
        ...record,
        state: 'awaiting_confirmation',
        pendingDocument: event.draft,
      };

    case 'USER_CONFIRMED':
      if (record.state !== 'awaiting_confirmation') {
        return record;
      }
      return { ...record, state: 'submitting' };

    case 'USER_CORRECTED':
      if (record.state !== 'awaiting_confirmation') {
        return record;
      }
      if (record.correctionCount >= 1) {
        return { ...record, state: 'escalated' };
      }
      return {
        ...record,
        state: 'awaiting_confirmation',
        correctionCount: record.correctionCount + 1,
        pendingDocument: event.draft,
      };

    case 'WEBHOOK_RECEIVED':
      if (record.state !== 'submitting') {
        return record;
      }
      return {
        ...record,
        state: 'idle',
        correctionCount: 0,
        pendingDocument: null,
        correlationId: null,
      };
  }
}
