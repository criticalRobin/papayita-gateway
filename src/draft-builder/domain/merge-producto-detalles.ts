import { ProductoDetalle } from '../../catalog/catalog-search.interface';
import { FinalInvoiceDetalle } from './types';

// Positional: index i of productoDetalles corresponds to index i of the
// request's items[] sent to POST /inventario/productos/detalles (the
// response carries no id field to match back by, so order is the only
// correlation available — verify this against the real API).
export function mergeProductoDetalles(
  productoDetalles: ProductoDetalle[],
  precioUnitarioOverrides: (number | undefined)[],
): FinalInvoiceDetalle[] {
  return productoDetalles.map((pd, index) => {
    const precioUnitario = precioUnitarioOverrides[index] ?? pd.precioUnitario;

    const detalle: FinalInvoiceDetalle = {
      codigoPrincipal: pd.codigoPrincipal,
      descripcion: pd.descripcion,
      unidadMedida: pd.unidadMedida,
      cantidad: pd.cantidad,
      precioUnitario,
      descuento: pd.descuento,
      // Computed by Core API from the catalog price — if the user overrode
      // precioUnitario above, these no longer reconcile against it. Known
      // MVP gap: /detalles has no way to recompute tax for an overridden
      // price. Not a real submission yet (see draft-builder.service.ts), so
      // left as-is rather than guessed at here.
      impuestos: pd.impuestos,
    };
    if (pd.codigoAuxiliar) {
      detalle.codigoAuxiliar = pd.codigoAuxiliar;
    }
    return detalle;
  });
}
