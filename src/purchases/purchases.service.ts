import { Inject, Injectable } from '@nestjs/common';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { TerminalCoreApiError } from '../core-api/core-api.errors';
import {
  PurchaseRegisteredResponse,
  PurchasesClient,
} from './purchases-client.interface';

// Core API's failure shape for this endpoint isn't confirmed to always come back as
// a non-2xx status — this guards the case where it responds 200 with a body like
// { success: false, error: "..." } instead of throwing on the HTTP layer.
interface PurchaseFailureResponse {
  success: false;
  error: string;
}

function isFailureResponse(
  data: PurchaseRegisteredResponse | PurchaseFailureResponse,
): data is PurchaseFailureResponse {
  return (data as PurchaseFailureResponse).success === false;
}

@Injectable()
export class PurchasesService implements PurchasesClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
  ) {}

  async registrarXml(
    token: CoreApiUserToken,
    xml: string,
  ): Promise<PurchaseRegisteredResponse> {
    const data = await this.coreApiClient.post<
      PurchaseRegisteredResponse | PurchaseFailureResponse
    >('/compras/xml', token, xml, { 'Content-Type': 'application/xml' });

    if (isFailureResponse(data)) {
      throw new TerminalCoreApiError(data.error);
    }

    return data;
  }
}
