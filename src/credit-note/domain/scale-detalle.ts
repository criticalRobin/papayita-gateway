import { CreditNoteXmlDetalle } from './types';

// SRI/currency convention used throughout this codebase (see
// PURCHASE_SUCCESS_REPLY's toFixed(2)) — no existing money-rounding helper to
// reuse, so this stays local to this one computation.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// A partial-quantity credit note line can't be recomputed by Core API (unlike
// draft-builder's new-invoice items, which go through
// POST /inventario/productos/detalles) — the original invoice's SRI-computed
// baseImponible/valor are all the gateway has, so every money figure is
// scaled by the same cantidad ratio rather than re-derived from
// precioUnitario. tarifa/codigo/codigoPorcentaje never change.
export function scaleDetalleForCantidad(
  detalle: CreditNoteXmlDetalle,
  cantidad: number,
): CreditNoteXmlDetalle {
  const ratio = cantidad / detalle.cantidad;

  return {
    ...detalle,
    cantidad,
    descuento: round2(detalle.descuento * ratio),
    impuestos: detalle.impuestos.map((impuesto) => {
      const baseImponible = round2(impuesto.baseImponible * ratio);
      return {
        ...impuesto,
        baseImponible,
        valor: round2(baseImponible * (impuesto.tarifa / 100)),
      };
    }),
  };
}
