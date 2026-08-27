/** Network blip / Core API 5xx / rate limit — safe to retry. */
export class RetryableCoreApiError extends Error {}

/** Bad credentials, invalid/expired refresh token, malformed request — retrying won't help. */
export class TerminalCoreApiError extends Error {}
