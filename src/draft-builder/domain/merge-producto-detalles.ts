import { ProductoDetalle } from '../../catalog/catalog-search.interface';
import { FinalInvoiceDetalle } from './types';

// Positional: index i of productoDetalles corresponds to index i of the
// request's items[] sent to POST /inventario/productos/detalles (the
// response carries no id field to match back by, so order is the only
// correlation available — verify this against the real API).
export function mergeProductoDetalles(
  productoDetalles: ProductoDetalle[],
): FinalInvoiceDetalle[] {
  return productoDetalles.map((pd) => {
    const detalle: FinalInvoiceDetalle = {
      codigoPrincipal: pd.codigoPrincipal,
      descripcion: pd.descripcion,
      unidadMedida: pd.unidadMedida,
      cantidad: pd.cantidad,
      precioUnitario: pd.precioUnitario,
      descuento: pd.descuento,
      impuestos: pd.impuestos,
    };
    if (pd.codigoAuxiliar) {
      detalle.codigoAuxiliar = pd.codigoAuxiliar;
    }
    return detalle;
  });
}
