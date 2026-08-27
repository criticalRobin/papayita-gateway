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
  it('idle -> awaiting_confirmation on a parsed billing attempt', () => {
    const next = transition(record({ state: 'idle' }), {
      type: 'BILLING_ATTEMPT_PARSED',
      draft: { total: 10 },
    });
    expect(next.state).toBe('awaiting_confirmation');
    expect(next.pendingDocument).toEqual({ total: 10 });
  });

  it('awaiting_confirmation -> submitting on user confirmation', () => {
    const next = transition(record({ state: 'awaiting_confirmation' }), {
      type: 'USER_CONFIRMED',
    });
    expect(next.state).toBe('submitting');
  });

  it('awaiting_confirmation -> awaiting_confirmation on the first correction, bumping correctionCount', () => {
    const next = transition(
      record({ state: 'awaiting_confirmation', correctionCount: 0 }),
      { type: 'USER_CORRECTED', draft: { total: 20 } },
    );
    expect(next.state).toBe('awaiting_confirmation');
    expect(next.correctionCount).toBe(1);
    expect(next.pendingDocument).toEqual({ total: 20 });
  });

  it('escalates instead of allowing a second correction', () => {
    const next = transition(
      record({ state: 'awaiting_confirmation', correctionCount: 1 }),
      { type: 'USER_CORRECTED', draft: { total: 30 } },
    );
    expect(next.state).toBe('escalated');
  });

  it('submitting -> idle on webhook received, clearing correction/pending state', () => {
    const next = transition(
      record({
        state: 'submitting',
        correctionCount: 1,
        pendingDocument: { total: 10 },
        correlationId: 'corr-1',
      }),
      { type: 'WEBHOOK_RECEIVED' },
    );
    expect(next.state).toBe('idle');
    expect(next.correctionCount).toBe(0);
    expect(next.pendingDocument).toBeNull();
    expect(next.correlationId).toBeNull();
  });

  it('is a no-op for events that do not apply to the current state', () => {
    const idle = record({ state: 'idle' });
    expect(transition(idle, { type: 'USER_CONFIRMED' })).toEqual(idle);

    const escalated = record({ state: 'escalated' });
    expect(
      transition(escalated, { type: 'USER_CORRECTED', draft: {} }),
    ).toEqual(escalated);

    const submitting = record({ state: 'submitting' });
    expect(
      transition(submitting, { type: 'BILLING_ATTEMPT_PARSED', draft: {} }),
    ).toEqual(submitting);
  });

  it('never reads the system clock — updatedAt is untouched by transition()', () => {
    const before = record({ state: 'idle', updatedAt: 'fixed-timestamp' });
    const next = transition(before, {
      type: 'BILLING_ATTEMPT_PARSED',
      draft: {},
    });
    expect(next.updatedAt).toBe('fixed-timestamp');
  });
});
