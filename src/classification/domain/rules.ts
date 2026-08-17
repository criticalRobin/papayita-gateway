import { IntentCategory } from './types';

// Whole-message salutations only. "hola quiero facturar dos colas" must NOT
// match here — it's a billing attempt with a greeting prefix, and should fall
// through to embedding scoring instead. Keeping this list narrow (pure
// greetings, no partial/prefix matching) is what keeps this rule safe to run
// unconditionally before any real language understanding happens.
const GREETING_PHRASES = [
  'hola',
  'ola',
  'hey',
  'hi',
  'hello',
  'buenas',
  'buenas tardes',
  'buenas noches',
  'buenos dias',
  'buen dia',
  'que tal',
  'saludos',
];

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[¡!¿?.,;:]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchGreeting(normalized: string): boolean {
  return GREETING_PHRASES.includes(normalized);
}

export function matchTrivialNoise(normalized: string): boolean {
  const meaningful = normalized.replace(/[^a-z0-9]/g, '');
  return meaningful.length < 2;
}

export function applyRules(text: string): IntentCategory | null {
  const normalized = normalize(text);
  if (matchGreeting(normalized)) {
    return 'greeting';
  }
  if (matchTrivialNoise(normalized)) {
    return 'out_of_context';
  }
  return null;
}
