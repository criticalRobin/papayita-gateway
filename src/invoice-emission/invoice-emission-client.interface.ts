import type { CoreApiUserToken } from '../core-api/core-api-token';
import type { FinalInvoice } from '../draft-builder/domain/types';

export interface EmitirFacturaResponse {
  mensaje: string;
  jobId: string;
  estado: string;
}

export interface InvoiceEmissionClient {
  emitir(
    token: CoreApiUserToken,
    invoice: FinalInvoice,
  ): Promise<EmitirFacturaResponse>;
  getRide(token: CoreApiUserToken, claveAcceso: string): Promise<Buffer>;
}
