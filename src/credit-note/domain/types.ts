import type { ImpuestoDetalle } from '../../catalog/catalog-search.interface';

// One row from GET /sri/comprobantes, already filtered to estado AUTORIZADO
// by credit-note-api.service.ts — this is the only comprobante state a
// credit note can reference.
export interface ComprobanteSummary {
  claveAcceso: string;
  fechaEmision: string;
  secuencial: string;
  razonSocialComprador: string;
  identificacionComprador: string;
  subtotal: number;
  total: number;
  estado: string;
}

// Discriminant stored as the conversation-state pendingDocument for the
// credit-note flow — see conversation-state's DRAFT_READY event, which is
// shared with draft-builder's invoice-draft payload (undiscriminated there).
export interface CreditNoteCandidatesDocument {
  kind: 'credit_note_candidates';
  rucEmisor: string;
  identificacionComprador: string;
  candidatos: ComprobanteSummary[];
}

export interface CreditNoteXmlDetalle {
  codigoPrincipal: string;
  codigoAuxiliar: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  impuestos: ImpuestoDetalle[];
}

export interface CreditNoteXmlEmisor {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  dirMatriz: string;
  establecimiento: string;
  puntoEmision: string;
  obligadoContabilidad: 'SI' | 'NO';
  contribuyenteRimpe: string | null;
}

export interface CreditNoteXmlComprador {
  tipoIdentificacion: string;
  identificacion: string;
  razonSocial: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
}

// Everything parsed out of GET /sri/comprobantes/{claveAcceso}/xml, plus
// persona-enriched comprador contact fields — this is exactly the JSON shape
// handed to the webview after an invoice is selected.
export interface CreditNoteXmlData {
  ambiente: string;
  tipoEmision: string;
  fechaEmision: string;
  secuencial: string;
  emisor: CreditNoteXmlEmisor;
  comprador: CreditNoteXmlComprador;
  codDocModificado: string;
  numDocModificado: string;
  fechaEmisionDocSustento: string;
  detalles: CreditNoteXmlDetalle[];
}

export interface ConfirmCreditNoteComprador {
  razonSocial?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

// POST /sri/emitir/nota-credito body — no secuencial key, ever: Core API
// assigns it at submission time (same discipline as FinalInvoice in
// draft-builder/domain/types.ts). fechaEmision IS required here (unlike
// FinalInvoice) — Core API validates it as dd/mm/yyyy and does not default
// it, so the gateway stamps the system clock's current date.
export interface FinalCreditNote {
  ambiente: string;
  tipoEmision: string;
  fechaEmision: string;
  emisor: {
    ruc: string;
    razonSocial: string;
    nombreComercial: string | null;
    dirMatriz: string;
    dirEstablecimiento: string;
    establecimiento: string;
    puntoEmision: string;
    obligadoContabilidad: 'SI' | 'NO';
    contribuyenteRimpe: string | null;
  };
  comprador: {
    tipoIdentificacion: string;
    identificacion: string;
    razonSocial: string;
    direccion?: string;
    telefono?: string;
    email?: string;
  };
  codDocModificado: string;
  numDocModificado: string;
  fechaEmisionDocSustento: string;
  motivo: string;
  detalles: CreditNoteXmlDetalle[];
}

export interface EmitirNotaCreditoResponse {
  mensaje: string;
  jobId: string;
  estado: string;
  advertencias?: string[];
}
