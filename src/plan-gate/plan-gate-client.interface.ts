import type { CoreApiUserToken } from '../core-api/core-api-token';
import type { PreflightResponse } from './domain/types';

// Declared here (not in plan-gate.module.ts) so both the module (providers
// array) and plan-gate.service.ts (as a same-module consumer of this token)
// can import it without a module<->service circular import.
export const PLAN_GATE_CLIENT = 'PLAN_GATE_CLIENT';

export interface PlanGateClient {
  // POST /sri/preflight — SRI-readiness + plan/quota check for one
  // establecimiento/puntoEmision.
  checkPreflight(
    token: CoreApiUserToken,
    ruc: string,
    establecimiento: string,
    puntoEmision: string,
  ): Promise<PreflightResponse>;
}
