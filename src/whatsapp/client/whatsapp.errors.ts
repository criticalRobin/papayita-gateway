/** Network blip / WhatsApp Graph API 5xx / rate limit — safe to retry. */
export class RetryableWhatsappError extends Error {}

/** Bad token, invalid recipient, malformed request — retrying won't help. */
export class TerminalWhatsappError extends Error {}
