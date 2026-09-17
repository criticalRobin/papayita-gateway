import { planIncludesFeature } from './feature-matrix';

describe('planIncludesFeature', () => {
  it('BASICO only includes billing', () => {
    expect(planIncludesFeature('BASICO', 'BILLING')).toBe(true);
    expect(planIncludesFeature('BASICO', 'CREDIT_NOTE')).toBe(false);
    expect(planIncludesFeature('BASICO', 'PRODUCT_MANAGEMENT')).toBe(false);
    expect(planIncludesFeature('BASICO', 'PURCHASE_REGISTRATION')).toBe(false);
  });

  it('MEDIO includes billing and credit notes only', () => {
    expect(planIncludesFeature('MEDIO', 'BILLING')).toBe(true);
    expect(planIncludesFeature('MEDIO', 'CREDIT_NOTE')).toBe(true);
    expect(planIncludesFeature('MEDIO', 'PRODUCT_MANAGEMENT')).toBe(false);
    expect(planIncludesFeature('MEDIO', 'PURCHASE_REGISTRATION')).toBe(false);
  });

  it('PRO and ULTIMATE include all four use cases', () => {
    for (const plan of ['PRO', 'ULTIMATE'] as const) {
      expect(planIncludesFeature(plan, 'BILLING')).toBe(true);
      expect(planIncludesFeature(plan, 'CREDIT_NOTE')).toBe(true);
      expect(planIncludesFeature(plan, 'PRODUCT_MANAGEMENT')).toBe(true);
      expect(planIncludesFeature(plan, 'PURCHASE_REGISTRATION')).toBe(true);
    }
  });
});
