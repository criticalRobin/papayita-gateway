import { Inject, Injectable } from '@nestjs/common';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import type { FinalInvoice } from '../draft-builder/domain/types';
import {
  EmitirFacturaResponse,
  InvoiceEmissionClient,
} from './invoice-emission-client.interface';

@Injectable()
export class InvoiceEmissionService implements InvoiceEmissionClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
  ) {}

  async emitir(
    token: CoreApiUserToken,
    invoice: FinalInvoice,
  ): Promise<EmitirFacturaResponse> {
    return this.coreApiClient.post<EmitirFacturaResponse>(
      '/sri/emitir/factura',
      token,
      invoice,
    );
  }

  async getRide(token: CoreApiUserToken, claveAcceso: string): Promise<Buffer> {
    return this.coreApiClient.getBinary(
      `/sri/comprobantes/${claveAcceso}/ride`,
      token,
    );
  }
}
