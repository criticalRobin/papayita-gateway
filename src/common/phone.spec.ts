import { toE164 } from './phone';

describe('toE164', () => {
  it('adds a leading + to bare-digit numbers', () => {
    expect(toE164('593993908744')).toBe('+593993908744');
  });

  it('leaves already-prefixed numbers unchanged', () => {
    expect(toE164('+593993908744')).toBe('+593993908744');
  });
});
