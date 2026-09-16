import {
  ConfirmCreditNoteComprador,
  CreditNoteXmlData,
  CreditNoteXmlDetalle,
  FinalCreditNote,
} from './types';

export interface BuildFinalCreditNoteOptions {
  motivo: string;
  razonSocial?: string;
  comprador?: ConfirmCreditNoteComprador;
}

// Assembles the exact POST /sri/emitir/nota-credito body. Never includes
// secuencial — Core API auto-assigns it at submission time. fechaEmision is
// passed in already formatted (dd/mm/yyyy) by the caller, same as
// draft-builder's buildSkeleton — keeps this function a pure clock-free
// mapping, no `new Date()` inside domain/. Every money field on
// `selectedDetalles` must already come from a freshly re-fetched XML and,
// for a partial-quantity credit, already run through scaleDetalleForCantidad
// (the caller's responsibility, see credit-note.service.ts) — this function
// never trusts anything the webview submitted for cantidad/precioUnitario/impuestos.
export function buildFinalCreditNote(
  data: CreditNoteXmlData,
  selectedDetalles: CreditNoteXmlDetalle[],
  fechaEmision: string,
  options: BuildFinalCreditNoteOptions,
): FinalCreditNote {
  return {
    ambiente: data.ambiente,
    tipoEmision: data.tipoEmision,
    fechaEmision,
    emisor: {
      ruc: data.emisor.ruc,
      razonSocial: data.emisor.razonSocial,
      nombreComercial: data.emisor.nombreComercial,
      dirMatriz: data.emisor.dirMatriz,
      // dirEstablecimiento isn't present on the factura XML — use dirMatriz
      // for both, per explicit product decision.
      dirEstablecimiento: data.emisor.dirMatriz,
      establecimiento: data.emisor.establecimiento,
      puntoEmision: data.emisor.puntoEmision,
      obligadoContabilidad: data.emisor.obligadoContabilidad,
      contribuyenteRimpe: data.emisor.contribuyenteRimpe,
    },
    comprador: {
      tipoIdentificacion: data.comprador.tipoIdentificacion,
      identificacion: data.comprador.identificacion,
      razonSocial: options.razonSocial ?? data.comprador.razonSocial,
      direccion:
        options.comprador?.direccion ?? data.comprador.direccion ?? undefined,
      telefono:
        options.comprador?.telefono ?? data.comprador.telefono ?? undefined,
      email: options.comprador?.email ?? data.comprador.email ?? undefined,
    },
    codDocModificado: data.codDocModificado,
    numDocModificado: data.numDocModificado,
    fechaEmisionDocSustento: data.fechaEmisionDocSustento,
    motivo: options.motivo,
    detalles: selectedDetalles,
  };
}
