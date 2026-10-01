import {
  MAX_BILLING_FIX_ATTEMPTS,
  isBillingContextExhausted,
  recordBillingAttempt,
  remainingBillingAttempts,
  startBillingContext,
} from './billing-context';
import type { BillingIssue } from '../../draft-builder/domain/errors';

const extracted = {
  comprador: { tipoIdentificacion: null, identificacion: '1850137918' },
  items: [{ idCliente: 'item-1', textoConsulta: 'chompa', cantidad: 1 }],
};
const productIssue: BillingIssue[] = [
  { kind: 'producto_no_encontrado', termino: 'chompa' },
];

describe('billing-context', () => {
  it('starts with the original message and zero attempts consumed', () => {
    const context = startBillingContext(
      'factura chompa',
      extracted,
      productIssue,
    );

    expect(context).toEqual({
      extracted,
      issues: productIssue,
      messages: ['factura chompa'],
      attempts: 0,
    });
    expect(remainingBillingAttempts(context)).toBe(MAX_BILLING_FIX_ATTEMPTS);
    expect(isBillingContextExhausted(context)).toBe(false);
  });

  it('records each follow-up, replacing extraction/issues and appending the message', () => {
    const patched = {
      ...extracted,
      items: [{ ...extracted.items[0], textoConsulta: 'chompa azul' }],
    };
    const context = recordBillingAttempt(
      startBillingContext('factura chompa', extracted, productIssue),
      'era chompa azul',
      patched,
      [],
    );

    expect(context.extracted).toBe(patched);
    expect(context.issues).toEqual([]);
    expect(context.messages).toEqual(['factura chompa', 'era chompa azul']);
    expect(context.attempts).toBe(1);
    expect(remainingBillingAttempts(context)).toBe(2);
  });

  it(`is exhausted after ${MAX_BILLING_FIX_ATTEMPTS} follow-ups, not before`, () => {
    let context = startBillingContext(
      'factura chompa',
      extracted,
      productIssue,
    );
    for (let i = 1; i < MAX_BILLING_FIX_ATTEMPTS; i++) {
      context = recordBillingAttempt(
        context,
        `intento ${i}`,
        extracted,
        productIssue,
      );
      expect(isBillingContextExhausted(context)).toBe(false);
    }

    context = recordBillingAttempt(context, 'último', extracted, productIssue);

    expect(isBillingContextExhausted(context)).toBe(true);
    expect(remainingBillingAttempts(context)).toBe(0);
  });
});
