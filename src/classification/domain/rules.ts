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

// A standalone 10-digit (cédula) or 13-digit (RUC) number is essentially
// unique to a real billing attempt — nobody asks a generic question about
// the service while quoting a specific client's identification number.
// Combined with any billing-stem word, this is a very strong, phrasing-
// independent signal that doesn't depend on guessing the right verb.
const BILLING_STEM = /factur|comprobante/;
const ID_NUMBER = /\b\d{10}\b|\b\d{13}\b/;

// Messages starting with these are asking ABOUT the service (info_request),
// not asking to perform a billing action right now — even when they mention
// "factura"/"facturar" ("que documentos necesito para emitir una factura",
// "puedo facturar con ustedes"). Checked before the verb-pattern rules below
// so a question is never rule-matched as a billing attempt.
const QUESTION_STARTERS = [
  'que',
  'como',
  'cual',
  'cuales',
  'cuanto',
  'cuanta',
  'cuantos',
  'cuantas',
  'quien',
  'donde',
  'puedo',
  'podria',
  'existe',
];

function looksLikeQuestion(normalized: string): boolean {
  return QUESTION_STARTERS.some(
    (word) => normalized === word || normalized.startsWith(`${word} `),
  );
}

// Imperative/declarative billing phrasings. Verbs require the billing noun
// immediately adjacent (not just "appears somewhere later in the sentence")
// so these can't drift into matching an unrelated info_request question that
// happens to mention "facturar" further down the sentence.
const ARTICLE = '(el\\s+|la\\s+|un\\s+|una\\s+)?';
const BILLING_ACTION_PATTERNS = [
  new RegExp(
    `\\b(emite|genera|generame|hazme|haceme|dame)\\s+${ARTICLE}(factura|comprobante)`,
  ),
  new RegExp(
    `\\b(quiero|necesito)\\s+${ARTICLE}(factura|facturar|comprobante|emitir\\s+${ARTICLE}(factura|comprobante))`,
  ),
  /\bfactura(me)?\s+(a\s+nombre|esta|esa|la\s+venta|por\s+favor)/,
];

export function matchBillingAttempt(normalized: string): boolean {
  if (ID_NUMBER.test(normalized) && BILLING_STEM.test(normalized)) {
    return true;
  }
  if (looksLikeQuestion(normalized)) {
    return false;
  }
  return BILLING_ACTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

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
  if (matchBillingAttempt(normalized)) {
    return 'billing_attempt';
  }
  return null;
}
