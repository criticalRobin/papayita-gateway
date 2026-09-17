import { planIncludesFeature } from './feature-matrix';
import { PlanName, UseCase } from './types';

export type FeatureTierDecision =
  | { allowed: true }
  | { allowed: false; reason: 'FEATURE_NOT_IN_PLAN'; planName: PlanName };

export function evaluateFeatureTierGate(
  planName: PlanName,
  useCase: UseCase,
): FeatureTierDecision {
  if (planIncludesFeature(planName, useCase)) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'FEATURE_NOT_IN_PLAN', planName };
}
