import {
  ConversationRecord,
  createIdleRecord,
  transition,
} from './state-machine';

function record(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return { ...createIdleRecord(), ...overrides };
}

describe('transition', () => {
  it('idle -> awaiting_webview_action when the draft is ready', () => {
    const next = transition(record({ state: 'idle' }), {
      type: 'DRAFT_READY',
      correlationId: 'corr-1',
      draft: { total: 10 },
    });
    expect(next.state).toBe('awaiting_webview_action');
    expect(next.correlationId).toBe('corr-1');
    expect(next.pendingDocument).toEqual({ total: 10 });
  });

  it('awaiting_webview_action -> submitting when the webview confirms', () => {
    const next = transition(
      record({ state: 'awaiting_webview_action', correlationId: 'corr-1' }),
      { type: 'WEBVIEW_CONFIRMED' },
    );
    expect(next.state).toBe('submitting');
  });

  it('submitting -> idle on webhook received, clearing correlation/pending state', () => {
    const next = transition(
      record({
        state: 'submitting',
        pendingDocument: { total: 10 },
        correlationId: 'corr-1',
      }),
      { type: 'WEBHOOK_RECEIVED' },
    );
    expect(next.state).toBe('idle');
    expect(next.pendingDocument).toBeNull();
    expect(next.correlationId).toBeNull();
  });

  it('is a no-op for events that do not apply to the current state', () => {
    const idle = record({ state: 'idle' });
    expect(transition(idle, { type: 'WEBVIEW_CONFIRMED' })).toEqual(idle);

    const submitting = record({ state: 'submitting' });
    expect(
      transition(submitting, {
        type: 'DRAFT_READY',
        correlationId: 'corr-2',
        draft: {},
      }),
    ).toEqual(submitting);

    const awaiting = record({ state: 'awaiting_webview_action' });
    expect(transition(awaiting, { type: 'WEBHOOK_RECEIVED' })).toEqual(
      awaiting,
    );
  });

  it('never reads the system clock — updatedAt is untouched by transition()', () => {
    const before = record({ state: 'idle', updatedAt: 'fixed-timestamp' });
    const next = transition(before, {
      type: 'DRAFT_READY',
      correlationId: 'corr-1',
      draft: {},
    });
    expect(next.updatedAt).toBe('fixed-timestamp');
  });
});
