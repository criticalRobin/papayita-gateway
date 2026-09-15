import { Inject, Injectable } from '@nestjs/common';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import {
  CreditNoteClient,
  ListComprobantesParams,
} from './credit-note-client.interface';
import {
  ComprobanteSummary,
  EmitirNotaCreditoResponse,
  FinalCreditNote,
} from './domain/types';

const AUTORIZADO = 'AUTORIZADO';
const TIPO_COMPROBANTE_FACTURA = '01';
const ESTABLECIMIENTO = '001';
const PUNTO_EMISION = '001';

interface ListComprobantesResponse {
  data: ComprobanteSummary[];
}

@Injectable()
export class CreditNoteApiService implements CreditNoteClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
  ) {}

  async listComprobantes(
    token: CoreApiUserToken,
    params: ListComprobantesParams,
  ): Promise<ComprobanteSummary[]> {
    const query = new URLSearchParams({
      rucEmisor: params.rucEmisor,
      identificacionComprador: params.identificacionComprador,
      tipoComprobante: TIPO_COMPROBANTE_FACTURA,
      establecimiento: ESTABLECIMIENTO,
      puntoEmision: PUNTO_EMISION,
    });

    const response = await this.coreApiClient.get<ListComprobantesResponse>(
      `/sri/comprobantes?${query.toString()}`,
      token,
    );

    // A credit note can only reference an already-authorized invoice.
    return response.data.filter((c) => c.estado === AUTORIZADO);
  }

  async getComprobanteXml(
    token: CoreApiUserToken,
    claveAcceso: string,
  ): Promise<Buffer> {
    return this.coreApiClient.getBinary(
      `/sri/comprobantes/${claveAcceso}/xml`,
      token,
    );
  }

  async emitir(
    token: CoreApiUserToken,
    payload: FinalCreditNote,
  ): Promise<EmitirNotaCreditoResponse> {
    return this.coreApiClient.post<EmitirNotaCreditoResponse>(
      '/sri/emitir/nota-credito',
      token,
      payload,
    );
  }
}
