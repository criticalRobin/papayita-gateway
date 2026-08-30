import {
  CatalogProduct,
  ImpuestoDetalle,
} from '../../catalog/catalog-search.interface';
import { EmisorProfile } from '../../emisor/emisor-client.interface';

/**
 * SRI Tabla 11 (formas de pago) — subset this gateway supports at launch.
 * Values are the SRI-assigned codes, not arbitrary — never renumber.
 */
export enum FormaPago {
  EFECTIVO = '01',
  TARJETA_DEBITO = '16',
  TARJETA_CREDITO = '19',
  TRANSFERENCIA = '20',
}

export interface InvoiceSkeleton {
  ambiente: string;
  tipoEmision: string;
  fechaEmision: string;
  emisor: Partial<EmisorProfile>;
}

export interface CompradorDraft {
  tipoIdentificacion: '04' | '05' | null;
  identificacion: string | null;
  razonSocial: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  verified: boolean;
}

export type CandidateResolution =
  | { status: 'unresolved'; candidates: [] }
  | {
      status: 'auto_selected';
      candidates: [CatalogProduct];
      selectedCandidateId: string;
    }
  | { status: 'needs_choice'; candidates: CatalogProduct[] };

export interface DetalleDraft {
  codigoPrincipal: string | null;
  codigoAuxiliar: string | null;
  descripcion: string;
  unidadMedida: string | null;
  cantidad: number;
  precioUnitario: number | null;
  descuento: number;
}

export interface DraftItem {
  idCliente: string;
  textoConsulta: string;
  resolutionStatus: CandidateResolution['status'];
  candidates: CatalogProduct[];
  selectedCandidateId: string | null;
  detalle: DetalleDraft;
}

export interface Draft {
  correlationId: string;
  comprador: CompradorDraft;
  items: DraftItem[];
  precioTotalMencionado: number | null;
  formaPagoMencionada: string | null;
}

export type FinalInvoiceEmisor = Partial<EmisorProfile>;

export interface FinalInvoiceComprador {
  tipoIdentificacion?: '04' | '05';
  identificacion?: string;
  razonSocial?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

export interface FinalInvoiceDetalle {
  codigoPrincipal: string;
  codigoAuxiliar?: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  impuestos: ImpuestoDetalle[];
}

export interface FinalInvoicePago {
  formaPago: FormaPago;
  total: number;
  plazo: number;
  unidadTiempo: string;
}

// No `secuencial` key, ever — Core API assigns it at submission time.
// `impuestos` per detalle comes from POST /inventario/productos/detalles at
// confirm time (baseImponible/valor computed server-side from
// catalogo_tarifas_impuesto) — never computed or guessed by the gateway.
export interface FinalInvoice {
  ambiente: string;
  tipoEmision: string;
  fechaEmision: string;
  emisor: FinalInvoiceEmisor;
  comprador: FinalInvoiceComprador;
  detalles: FinalInvoiceDetalle[];
  pagos: FinalInvoicePago[];
}
