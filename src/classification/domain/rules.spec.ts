import {
  applyRules,
  extractIdNumber,
  matchBillingAttempt,
  matchCreditNoteRequest,
  matchGreeting,
  matchTrivialNoise,
  normalize,
} from './rules';
import { SEED_PHRASES } from './seed-phrases';

describe('normalize', () => {
  it('lowercases, strips accents and punctuation, collapses whitespace', () => {
    expect(normalize('¡Buenos Días!!')).toBe('buenos dias');
    expect(normalize('  Hola   Mundo  ')).toBe('hola mundo');
  });
});

describe('matchGreeting', () => {
  it.each(['hola', 'buenas', 'buenos dias', 'hey', 'que tal'])(
    'matches pure salutation "%s"',
    (phrase) => {
      expect(matchGreeting(normalize(phrase))).toBe(true);
    },
  );

  it('does not match a greeting prefix attached to real content', () => {
    expect(matchGreeting(normalize('hola quiero facturar dos colas'))).toBe(
      false,
    );
  });

  it('does not match unrelated text', () => {
    expect(matchGreeting(normalize('cuanto cuesta el servicio'))).toBe(false);
  });
});

describe('matchTrivialNoise', () => {
  it.each(['', '?', '..', 'k', '   '])('treats "%s" as noise', (text) => {
    expect(matchTrivialNoise(normalize(text))).toBe(true);
  });

  it('does not treat real short content as noise', () => {
    expect(matchTrivialNoise(normalize('ok'))).toBe(false);
  });
});

describe('matchBillingAttempt', () => {
  it('matches the reported real-world failure: imperative verb + product list + client id', () => {
    const text =
      'emite una factura por la venta de un manga de one piece y uno de attack on titans. Al cliente 1850137918.';
    expect(matchBillingAttempt(normalize(text))).toBe(true);
  });

  it.each([
    'quiero facturar dos colas',
    'necesito facturar una venta de hoy',
    'necesito una factura',
    'hazme una factura de dos pizzas',
    'generame un comprobante para el cliente',
    'facturame esta compra por favor',
    'factura a nombre de pedro con ruc 1790012345001',
    'quiero emitir un comprobante para un cliente',
  ])('matches the clear billing phrasing "%s"', (text) => {
    expect(matchBillingAttempt(normalize(text))).toBe(true);
  });

  it('matches via the id-number signal alone, regardless of verb phrasing', () => {
    expect(
      matchBillingAttempt(normalize('factura para el cliente 1850137918')),
    ).toBe(true);
  });

  it.each([
    'cuanto cuesta usar este servicio',
    'como funciona esto',
    'necesito ayuda para entender como facturar',
    'que necesito para registrarme',
    'puedo facturar con ustedes',
    'que documentos necesito para emitir una factura',
    'cual es el costo del servicio',
    'como me registro',
    'quiero saber mas sobre el servicio',
    'esto tiene algun costo',
  ])('does not match the info_request phrasing "%s"', (text) => {
    expect(matchBillingAttempt(normalize(text))).toBe(false);
  });

  it('does not match plain greetings or unrelated text', () => {
    expect(matchBillingAttempt(normalize('hola'))).toBe(false);
    expect(matchBillingAttempt(normalize('gracias, hasta luego'))).toBe(false);
  });

  // Regression guard: every seeded info_request example must never trip the
  // billing rule — a false positive here would silently break the seed set's
  // own purpose.
  it('never matches any seeded info_request phrase', () => {
    for (const phrase of SEED_PHRASES.info_request) {
      expect(matchBillingAttempt(normalize(phrase))).toBe(false);
    }
  });

  it('matches every seeded billing_attempt phrase', () => {
    for (const phrase of SEED_PHRASES.billing_attempt) {
      expect(matchBillingAttempt(normalize(phrase))).toBe(true);
    }
  });
});

describe('matchCreditNoteRequest', () => {
  it.each([
    'emite una nota de credito al cliente 1850137918',
    'necesito una nota de credito para el cliente 1802258721',
    'nota de crédito para 1850137918001',
    'nota credito al cliente 1802258721',
  ])('matches clear credit-note phrasing "%s"', (text) => {
    expect(matchCreditNoteRequest(normalize(text))).toBe(true);
  });

  it('requires an id number even with the credit-note stem present', () => {
    expect(
      matchCreditNoteRequest(normalize('necesito una nota de credito')),
    ).toBe(false);
  });

  it('does not match a plain billing attempt', () => {
    expect(
      matchCreditNoteRequest(normalize('factura para el cliente 1850137918')),
    ).toBe(false);
  });

  it('wins over the billing stem when both appear in the same message', () => {
    const text = 'nota de credito de la factura del cliente 1850137918';
    expect(matchCreditNoteRequest(normalize(text))).toBe(true);
  });

  it('never matches any seeded billing_attempt phrase', () => {
    for (const phrase of SEED_PHRASES.billing_attempt) {
      expect(matchCreditNoteRequest(normalize(phrase))).toBe(false);
    }
  });

  // Unlike billing_attempt's seed set, credit_note_request's seeds deliberately
  // include paraphrases without the literal stem ("devolver", "anular un
  // producto") — those exist precisely to be caught by embedding fallback
  // instead of this rule, so no "matches every seeded phrase" assertion here.
});

describe('extractIdNumber', () => {
  it('extracts a 10-digit cedula', () => {
    expect(
      extractIdNumber(normalize('nota de credito al cliente 1802258721')),
    ).toBe('1802258721');
  });

  it('extracts a 13-digit ruc', () => {
    expect(
      extractIdNumber(normalize('nota de credito al cliente 1850137918001')),
    ).toBe('1850137918001');
  });

  it('returns null when no id number is present', () => {
    expect(
      extractIdNumber(normalize('necesito una nota de credito')),
    ).toBeNull();
  });
});

describe('applyRules', () => {
  it('returns credit_note_request for clear credit-note phrasing, taking priority over billing', () => {
    expect(applyRules('emite una nota de credito al cliente 1850137918')).toBe(
      'credit_note_request',
    );
    expect(
      applyRules('nota de credito de la factura del cliente 1850137918'),
    ).toBe('credit_note_request');
  });

  it('returns greeting for a pure salutation', () => {
    expect(applyRules('Hola')).toBe('greeting');
  });

  it('returns out_of_context for trivial noise', () => {
    expect(applyRules('???')).toBe('out_of_context');
  });

  it('returns billing_attempt for clear billing phrasing, including a greeting prefix', () => {
    expect(applyRules('hola quiero facturar dos colas')).toBe(
      'billing_attempt',
    );
    expect(applyRules('necesito una factura')).toBe('billing_attempt');
    expect(
      applyRules(
        'emite una factura por la venta de un manga de one piece y uno de attack on titans. Al cliente 1850137918.',
      ),
    ).toBe('billing_attempt');
  });

  it('falls through (null) for text with no rule match, e.g. info_request questions', () => {
    expect(applyRules('cuanto cuesta usar este servicio')).toBeNull();
  });
});
