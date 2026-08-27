import {
  applyRules,
  matchGreeting,
  matchTrivialNoise,
  normalize,
} from './rules';

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

describe('applyRules', () => {
  it('returns greeting for a pure salutation', () => {
    expect(applyRules('Hola')).toBe('greeting');
  });

  it('returns out_of_context for trivial noise', () => {
    expect(applyRules('???')).toBe('out_of_context');
  });

  it('falls through (null) for anything else, including greeting-prefixed billing text', () => {
    expect(applyRules('hola quiero facturar dos colas')).toBeNull();
    expect(applyRules('necesito una factura')).toBeNull();
  });
});
