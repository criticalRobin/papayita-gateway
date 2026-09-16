import { scaleDetalleForCantidad } from './scale-detalle';
import { CreditNoteXmlDetalle } from './types';

const detalle: CreditNoteXmlDetalle = {
  codigoPrincipal: 'CONS-PS5-01',
  codigoAuxiliar: 'SONY-001',
  descripcion: 'Consola Sony PlayStation 5',
  cantidad: 5,
  precioUnitario: 100,
  descuento: 10,
  impuestos: [
    {
      codigo: '2',
      codigoPorcentaje: '4',
      tarifa: 15,
      baseImponible: 490,
      valor: 73.5,
    },
  ],
};

describe('scaleDetalleForCantidad', () => {
  it('scales descuento and every impuesto amount by the cantidad ratio', () => {
    const result = scaleDetalleForCantidad(detalle, 2);

    expect(result.cantidad).toBe(2);
    expect(result.descuento).toBe(4); // 10 * (2/5)
    expect(result.impuestos).toEqual([
      {
        codigo: '2',
        codigoPorcentaje: '4',
        tarifa: 15,
        baseImponible: 196, // 490 * (2/5)
        valor: 29.4, // 196 * 0.15
      },
    ]);
  });

  it('reproduces the original figures exactly when the full cantidad is selected', () => {
    const result = scaleDetalleForCantidad(detalle, 5);

    expect(result).toEqual(detalle);
  });

  it('rounds to 2 decimals', () => {
    const oddDetalle: CreditNoteXmlDetalle = {
      ...detalle,
      cantidad: 3,
      descuento: 1,
      impuestos: [
        {
          codigo: '2',
          codigoPorcentaje: '4',
          tarifa: 15,
          baseImponible: 10,
          valor: 1.5,
        },
      ],
    };

    const result = scaleDetalleForCantidad(oddDetalle, 1);

    expect(result.descuento).toBe(0.33); // 1 * (1/3) = 0.3333...
    expect(result.impuestos[0].baseImponible).toBe(3.33); // 10 * (1/3)
  });

  it('scales every impuesto entry independently on a multi-tax line', () => {
    const multiTaxDetalle: CreditNoteXmlDetalle = {
      ...detalle,
      cantidad: 4,
      descuento: 0,
      impuestos: [
        {
          codigo: '2',
          codigoPorcentaje: '4',
          tarifa: 15,
          baseImponible: 400,
          valor: 60,
        },
        {
          codigo: '3',
          codigoPorcentaje: '3072',
          tarifa: 10,
          baseImponible: 100,
          valor: 10,
        },
      ],
    };

    const result = scaleDetalleForCantidad(multiTaxDetalle, 1);

    expect(result.impuestos).toEqual([
      {
        codigo: '2',
        codigoPorcentaje: '4',
        tarifa: 15,
        baseImponible: 100,
        valor: 15,
      },
      {
        codigo: '3',
        codigoPorcentaje: '3072',
        tarifa: 10,
        baseImponible: 25,
        valor: 2.5,
      },
    ]);
  });
});
