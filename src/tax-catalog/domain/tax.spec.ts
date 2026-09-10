import { hasCodigoPorcentaje, Impuesto } from './tax';

const impuestos: Impuesto[] = [
  {
    codigo: '2',
    nombre: 'IVA',
    tarifas: [
      { codigoPorcentaje: '0', descripcion: 'IVA 0%', porcentaje: 0 },
      { codigoPorcentaje: '2', descripcion: 'IVA 12%', porcentaje: 12 },
    ],
  },
  { codigo: '3', nombre: 'ICE', tarifas: [] },
];

describe('hasCodigoPorcentaje', () => {
  it('returns true when the tariff exists under the given tax code', () => {
    expect(hasCodigoPorcentaje(impuestos, '2', '2')).toBe(true);
  });

  it('returns false when the tariff does not exist under the given tax code', () => {
    expect(hasCodigoPorcentaje(impuestos, '2', '99')).toBe(false);
  });

  it('returns false when the tax code itself is not in the catalog', () => {
    expect(hasCodigoPorcentaje(impuestos, '5', '0')).toBe(false);
  });

  it('returns false for a tax code with an empty tarifas list', () => {
    expect(hasCodigoPorcentaje(impuestos, '3', 'anything')).toBe(false);
  });
});
