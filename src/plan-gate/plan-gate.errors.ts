export type PlanGateReason = 'PLAN_LIMIT' | 'NOT_READY' | 'FEATURE_NOT_IN_PLAN';

// Terminal by nature — retrying the same job won't change the emisor's plan
// or usage. Callers catch this alongside TerminalCoreApiError and send a
// hardcoded reply; `detalle` is for logs only, never shown to the end user.
export class PlanGateBlockedError extends Error {
  constructor(
    readonly reason: PlanGateReason,
    readonly detalle: string,
  ) {
    super(`plan gate blocked: ${reason} — ${detalle}`);
  }
}
