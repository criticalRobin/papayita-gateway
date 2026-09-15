import type { CoreApiUserToken } from '../core-api/core-api-token';
import type {
  ComprobanteSummary,
  EmitirNotaCreditoResponse,
  FinalCreditNote,
} from './domain/types';

// Declared here (not in credit-note.module.ts) so both the module (providers
// array) and credit-note.service.ts (as a same-module consumer of this
// token) can import it without a module<->service circular import.
export const CREDIT_NOTE_CLIENT = 'CREDIT_NOTE_CLIENT';

export interface ListComprobantesParams {
  rucEmisor: string;
  identificacionComprador: string;
}

export interface CreditNoteClient {
  // GET /sri/comprobantes?rucEmisor=..&identificacionComprador=..&tipoComprobante=01&establecimiento=001&puntoEmision=001
  // Implementation filters the result to estado === 'AUTORIZADO' — a credit
  // note can only ever reference an authorized invoice.
  listComprobantes(
    token: CoreApiUserToken,
    params: ListComprobantesParams,
  ): Promise<ComprobanteSummary[]>;

  // GET /sri/comprobantes/{claveAcceso}/xml — returns the raw (already
  // gzip-decompressed by axios) XML bytes for one authorized invoice.
  getComprobanteXml(
    token: CoreApiUserToken,
    claveAcceso: string,
  ): Promise<Buffer>;

  // POST /sri/emitir/nota-credito — result arrives async via Core API's
  // comprobante.autorizado/rechazado webhook, same as facturas.
  emitir(
    token: CoreApiUserToken,
    payload: FinalCreditNote,
  ): Promise<EmitirNotaCreditoResponse>;
}
