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

// Whole-message phrases only, same rationale as GREETING_PHRASES — narrow
// and exact so this can run unconditionally before classification's
// embedding step, no LLM cost. Broadened from the old hardcoded two-phrase
// check (isManageInventoryCommand in the processor) so this is no longer a
// pre-classification special case but a real rule inside the intent system;
// the embedding seed phrases (seed-phrases.ts) then catch paraphrases this
// exact list misses.
const MANAGE_INVENTORY_PHRASES = [
  'administrar productos',
  'administrar inventario',
  'administrar mis productos',
  'administrar mi inventario',
  'gestionar productos',
  'gestionar inventario',
  'gestionar mis productos',
  'gestionar mi inventario',
  'ver inventario',
  'ver mi inventario',
  'ver productos',
  'ver mis productos',
  'ver catalogo',
  'ver mi catalogo',
  'mis productos',
  'mi inventario',
  'catalogo de productos',
];

// A standalone 10-digit (cédula) or 13-digit (RUC) number is essentially
// unique to a real billing attempt — nobody asks a generic question about
// the service while quoting a specific client's identification number.
// Combined with any billing-stem word, this is a very strong, phrasing-
// independent signal that doesn't depend on guessing the right verb.
const BILLING_STEM = /factur|comprobante/;
const ID_NUMBER = /\b\d{10}\b|\b\d{13}\b/;

// Same id-number signal as billing, but for the credit-note stem. Checked
// before matchBillingAttempt in applyRules() — a message can plausibly
// mention both "nota de crédito" and "factura" in the same sentence (e.g.
// "nota de credito de la factura del cliente 1850137918"), and the more
// specific credit-note phrasing must win.
const CREDIT_NOTE_STEM = /nota\s+de\s+cr[eé]dito|nota\s+cr[eé]dito/;

// Real-world credit-note requests rarely say "nota de crédito" literally —
// they describe the action instead ("anula parte de la factura...",
// "necesito devolver un producto que le facture..."). Without this, those
// messages still contain an id number + the word "factura", which trips
// matchBillingAttempt's ID_NUMBER+BILLING_STEM shortcut below (checked in
// applyRules() only after credit-note matching fails) and got
// misclassified as billing_attempt before embedding fallback ever ran —
// the rule stage returns confidence 1 and short-circuits everything after
// it. Stems, not full words, so anular/anula/anulación, devolver/devuelve/
// devolución, retornar, reembolso/reembolsar all match.
const CREDIT_NOTE_ACTION_STEM = /anul|devol|retorn|reembols/;

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
    `\\b(por\\s+favor\\s+)?(emite|genera|generame|hazme|haceme|hagas|dame)\\s+${ARTICLE}(factura|comprobante)`,
  ),
  new RegExp(
    `\\b(quiero|necesito|ayudame)(\\s+con)?(\\s+por\\s+favor)?(\\s+que\\s+me)?(\\s+(hagas|emitas|generes))?\\s+${ARTICLE}(factura|facturar|comprobante|emitir\\s+${ARTICLE}(factura|comprobante))`,
  ),
  /\bfactura(me)?\s+(a\s+nombre|esta|esa|la\s+venta|por\s+favor)/,
  /\b(factura|comprobante)\s+(para|de\s+la\s+venta)\b/,
  /\b\d+\s+[a-z]+.*\b(factura|comprobante|facturar)\b/,
  /\b(factura|comprobante|facturar)\b.*\b\d+\s+[a-z]+/,
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

// Deliberately narrower than matchBillingAttempt: requires both signals
// together, no verb-only fallback. A credit note is always issued against a
// specific customer, so the id number is never optional here.
export function matchCreditNoteRequest(normalized: string): boolean {
  return (
    ID_NUMBER.test(normalized) &&
    (CREDIT_NOTE_STEM.test(normalized) ||
      CREDIT_NOTE_ACTION_STEM.test(normalized))
  );
}

// Pulls the customer's cédula/RUC out of already-normalized text — the same
// signal matchBillingAttempt/matchCreditNoteRequest use to detect an id, but
// exposed so callers can extract the actual value once intent is known.
export function extractIdNumber(normalized: string): string | null {
  const match = normalized.match(ID_NUMBER);
  return match ? match[0] : null;
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

export function matchManageInventoryCommand(normalized: string): boolean {
  return MANAGE_INVENTORY_PHRASES.includes(normalized);
}

export function applyRules(text: string): IntentCategory | null {
  const normalized = normalize(text);
  if (matchGreeting(normalized)) {
    return 'greeting';
  }
  if (matchTrivialNoise(normalized)) {
    return 'out_of_context';
  }
  if (matchManageInventoryCommand(normalized)) {
    return 'manage_inventory';
  }
  if (matchCreditNoteRequest(normalized)) {
    return 'credit_note_request';
  }
  if (matchBillingAttempt(normalized)) {
    return 'billing_attempt';
  }
  return null;
}
