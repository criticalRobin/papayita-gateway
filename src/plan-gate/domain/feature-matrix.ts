import { PlanName, UseCase } from './types';

// ULTIMATE unlocks the same use cases as PRO — it only differs in
// limiteComprobantes, which preflight's own plan/uso fields already enforce.
const PLAN_FEATURES: Record<PlanName, ReadonlySet<UseCase>> = {
  BASICO: new Set(['BILLING']),
  MEDIO: new Set(['BILLING', 'CREDIT_NOTE']),
  PRO: new Set([
    'BILLING',
    'CREDIT_NOTE',
    'PRODUCT_MANAGEMENT',
    'PURCHASE_REGISTRATION',
  ]),
  ULTIMATE: new Set([
    'BILLING',
    'CREDIT_NOTE',
    'PRODUCT_MANAGEMENT',
    'PURCHASE_REGISTRATION',
  ]),
};

export function planIncludesFeature(
  planName: PlanName,
  useCase: UseCase,
): boolean {
  return PLAN_FEATURES[planName]?.has(useCase) ?? false;
}
