import {
  applyRules,
  matchBillingAttempt,
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

describe('applyRules', () => {
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
