import { evaluateFeatureTierGate } from './evaluate-feature-tier-gate';

describe('evaluateFeatureTierGate', () => {
  it('allows a feature included in the plan', () => {
    expect(evaluateFeatureTierGate('MEDIO', 'CREDIT_NOTE')).toEqual({
      allowed: true,
    });
  });

  it('blocks a feature not included in the plan', () => {
    expect(evaluateFeatureTierGate('BASICO', 'CREDIT_NOTE')).toEqual({
      allowed: false,
      reason: 'FEATURE_NOT_IN_PLAN',
      planName: 'BASICO',
    });
  });

  it('blocks product management / purchases below PRO', () => {
    expect(evaluateFeatureTierGate('MEDIO', 'PRODUCT_MANAGEMENT')).toEqual({
      allowed: false,
      reason: 'FEATURE_NOT_IN_PLAN',
      planName: 'MEDIO',
    });
    expect(evaluateFeatureTierGate('MEDIO', 'PURCHASE_REGISTRATION')).toEqual({
      allowed: false,
      reason: 'FEATURE_NOT_IN_PLAN',
      planName: 'MEDIO',
    });
  });
});
