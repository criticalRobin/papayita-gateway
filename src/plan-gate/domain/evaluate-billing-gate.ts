import { PreflightCheck, PreflightResponse } from './types';

export type BillingGateDecision =
  | { allowed: true }
  | { allowed: false; reason: 'PLAN_LIMIT' | 'NOT_READY'; detalle: string };

// Full SRI-readiness + quota gate for billing. `listo` already aggregates
// every sub-check, but a `plan.ok: false` failure alone is overridable via
// `permiteExcedente` — every other failing sub-check blocks unconditionally.
export function evaluateBillingGate(
  preflight: PreflightResponse,
): BillingGateDecision {
  if (preflight.listo) {
    return { allowed: true };
  }

  const nonPlanChecks: PreflightCheck[] = [
    preflight.certificado,
    preflight.puntoEmision,
    preflight.secuenciales,
    preflight.bodegaPrincipal,
    preflight.webhook,
    preflight.stock,
  ];
  const failedNonPlanCheck = nonPlanChecks.find((check) => !check.ok);
  if (failedNonPlanCheck) {
    return {
      allowed: false,
      reason: 'NOT_READY',
      detalle: failedNonPlanCheck.detalle,
    };
  }

  // Only `plan` is failing at this point.
  if (preflight.permiteExcedente) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'PLAN_LIMIT',
    detalle: preflight.plan.detalle,
  };
}
