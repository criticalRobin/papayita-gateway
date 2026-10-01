import {
  ConversationRecord,
  createIdleRecord,
  transition,
} from './state-machine';
import type { BillingContext } from './billing-context';

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

  describe('billing correction window', () => {
    const context: BillingContext = {
      extracted: {
        comprador: { tipoIdentificacion: null, identificacion: '1850137918' },
        items: [{ idCliente: 'item-1', textoConsulta: 'chompa', cantidad: 1 }],
      },
      issues: [{ kind: 'producto_no_encontrado', termino: 'chompa' }],
      messages: ['factura chompa'],
      attempts: 0,
    };

    it('idle -> awaiting_billing_fix on BILLING_INCOMPLETE, storing the context', () => {
      const next = transition(record({ state: 'idle' }), {
        type: 'BILLING_INCOMPLETE',
        context,
      });
      expect(next.state).toBe('awaiting_billing_fix');
      expect(next.billingContext).toEqual(context);
    });

    it('awaiting_billing_fix stays put on BILLING_INCOMPLETE, replacing the context', () => {
      const updated = { ...context, attempts: 1 };
      const next = transition(
        record({ state: 'awaiting_billing_fix', billingContext: context }),
        { type: 'BILLING_INCOMPLETE', context: updated },
      );
      expect(next.state).toBe('awaiting_billing_fix');
      expect(next.billingContext).toEqual(updated);
    });

    it('awaiting_billing_fix -> awaiting_webview_action on DRAFT_READY, clearing the context', () => {
      const next = transition(
        record({ state: 'awaiting_billing_fix', billingContext: context }),
        { type: 'DRAFT_READY', correlationId: 'corr-1', draft: {} },
      );
      expect(next.state).toBe('awaiting_webview_action');
      expect(next.correlationId).toBe('corr-1');
      expect(next.billingContext).toBeNull();
    });

    it('awaiting_billing_fix -> idle on BILLING_CONTEXT_CLEARED', () => {
      const next = transition(
        record({ state: 'awaiting_billing_fix', billingContext: context }),
        { type: 'BILLING_CONTEXT_CLEARED' },
      );
      expect(next.state).toBe('idle');
      expect(next.billingContext).toBeNull();
    });

    it('ignores window events outside the states they apply to', () => {
      const awaiting = record({ state: 'awaiting_webview_action' });
      expect(
        transition(awaiting, { type: 'BILLING_INCOMPLETE', context }),
      ).toEqual(awaiting);
      expect(transition(awaiting, { type: 'BILLING_CONTEXT_CLEARED' })).toEqual(
        awaiting,
      );
      const idle = record({ state: 'idle' });
      expect(transition(idle, { type: 'BILLING_CONTEXT_CLEARED' })).toEqual(
        idle,
      );
    });
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
