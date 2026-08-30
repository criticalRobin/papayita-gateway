/** Network blip / Core API 5xx / rate limit — safe to retry. */
export class RetryableCoreApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Bad credentials, invalid/expired refresh token, malformed request, 404 — retrying won't help. */
export class TerminalCoreApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
