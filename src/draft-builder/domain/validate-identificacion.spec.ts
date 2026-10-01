import { findIdentificacionProblem } from './validate-identificacion';

describe('findIdentificacionProblem', () => {
  it('accepts a valid cédula', () => {
    expect(findIdentificacionProblem('1850137918')).toBeNull();
  });

  it('accepts a valid natural-person RUC', () => {
    expect(findIdentificacionProblem('1850137918001')).toBeNull();
  });

  it('accepts private (9) and public (6) entity RUCs structurally', () => {
    expect(findIdentificacionProblem('1790011674001')).toBeNull();
    expect(findIdentificacionProblem('1760001550001')).toBeNull();
  });

  it('accepts consumidor final', () => {
    expect(findIdentificacionProblem('9999999999999')).toBeNull();
  });

  it('accepts separators inside the number', () => {
    expect(findIdentificacionProblem('185013791-8')).toBeNull();
  });

  it('flags a missing identificacion', () => {
    expect(findIdentificacionProblem(null)).toBe('faltante');
    expect(findIdentificacionProblem('')).toBe('faltante');
  });

  it('flags a wrong-length number', () => {
    expect(findIdentificacionProblem('185013791')).toBe('formato');
    expect(findIdentificacionProblem('18501379180')).toBe('formato');
    expect(findIdentificacionProblem('185013791800')).toBe('formato');
  });

  it('flags letters mixed in', () => {
    expect(findIdentificacionProblem('18501379A8')).toBe('formato');
  });

  it('flags a cédula with a bad check digit', () => {
    expect(findIdentificacionProblem('1850137912')).toBe('digito_verificador');
  });

  it('flags a RUC whose cédula part has a bad check digit', () => {
    expect(findIdentificacionProblem('1850137912001')).toBe(
      'digito_verificador',
    );
  });

  it('flags a natural-person RUC with establecimiento 000', () => {
    expect(findIdentificacionProblem('1850137918000')).toBe(
      'digito_verificador',
    );
  });

  it('flags an invalid province code', () => {
    expect(findIdentificacionProblem('9950137918')).toBe('digito_verificador');
  });
});
