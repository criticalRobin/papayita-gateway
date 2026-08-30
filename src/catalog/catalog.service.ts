import { Inject, Injectable } from '@nestjs/common';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import {
  CatalogSearchClient,
  CatalogSearchResultGroup,
  ProductoDetalle,
  ProductoDetalleRequestItem,
} from './catalog-search.interface';

interface CatalogSearchResponse {
  success: boolean;
  data: CatalogSearchResultGroup[];
}

interface ProductoDetallesResponse {
  success: boolean;
  data: { detalles: ProductoDetalle[] };
}

@Injectable()
export class CatalogService implements CatalogSearchClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
  ) {}

  async searchBatch(
    token: CoreApiUserToken,
    whatsapp: string,
    terminos: string[],
  ): Promise<CatalogSearchResultGroup[]> {
    if (terminos.length === 0) return [];

    const response = await this.coreApiClient.post<CatalogSearchResponse>(
      '/inventario/productos/buscar',
      token,
      { whatsapp: this.toE164(whatsapp), termino: terminos },
    );
    return response.data;
  }

  async getDetalles(
    token: CoreApiUserToken,
    whatsapp: string,
    items: ProductoDetalleRequestItem[],
  ): Promise<ProductoDetalle[]> {
    if (items.length === 0) return [];

    const response = await this.coreApiClient.post<ProductoDetallesResponse>(
      '/inventario/productos/detalles',
      token,
      { whatsapp: this.toE164(whatsapp), items },
    );
    return response.data.detalles;
  }

  // Meta's Cloud API gives us the phone number as bare digits (e.g.
  // "593993908744", no "+") — that's what phoneNumber is everywhere else in
  // this app (Redis keys, logging). Core API's own validator requires the
  // leading "+", so it's added only at this boundary, not propagated back.
  private toE164(phoneNumber: string): string {
    return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  }
}
