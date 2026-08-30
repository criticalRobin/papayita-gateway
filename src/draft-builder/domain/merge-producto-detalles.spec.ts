import { ProductoDetalle } from '../../catalog/catalog-search.interface';
import { mergeProductoDetalles } from './merge-producto-detalles';

function productoDetalle(
  overrides: Partial<ProductoDetalle> = {},
): ProductoDetalle {
  return {
    codigoPrincipal: 'CONS-PS5-01',
    codigoAuxiliar: 'SONY-001',
    descripcion: 'Consola Sony PlayStation 5',
    unidadMedida: 'Unidad',
    cantidad: 1,
    precioUnitario: 499.99,
    descuento: 0,
    impuestos: [
      {
        codigo: '2',
        codigoPorcentaje: '4',
        tarifa: 15,
        baseImponible: 499.99,
        valor: 75,
      },
    ],
    ...overrides,
  };
}

describe('mergeProductoDetalles', () => {
  it('maps a ProductoDetalle straight through, including impuestos', () => {
    const pd = productoDetalle();
    const [result] = mergeProductoDetalles([pd], [undefined]);

    expect(result).toEqual({
      codigoPrincipal: 'CONS-PS5-01',
      codigoAuxiliar: 'SONY-001',
      descripcion: 'Consola Sony PlayStation 5',
      unidadMedida: 'Unidad',
      cantidad: 1,
      precioUnitario: 499.99,
      descuento: 0,
      impuestos: pd.impuestos,
    });
  });

  it('omits codigoAuxiliar when the response has none', () => {
    const pd = productoDetalle({ codigoAuxiliar: null });
    const [result] = mergeProductoDetalles([pd], [undefined]);

    expect(result).not.toHaveProperty('codigoAuxiliar');
  });

  it('applies a precioUnitario override positionally when provided', () => {
    const pd = productoDetalle();
    const [result] = mergeProductoDetalles([pd], [480]);

    expect(result.precioUnitario).toBe(480);
  });

  it('matches overrides to detalles by index across multiple items', () => {
    const pd1 = productoDetalle({ precioUnitario: 10 });
    const pd2 = productoDetalle({ precioUnitario: 20 });

    const [r1, r2] = mergeProductoDetalles([pd1, pd2], [undefined, 25]);

    expect(r1.precioUnitario).toBe(10);
    expect(r2.precioUnitario).toBe(25);
  });
});
