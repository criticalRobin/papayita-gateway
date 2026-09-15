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
import { PostBatchCatalogProductDto } from './dto/post-batch-catalog.dto';
import { PostProductDetailDto } from './dto/post-product-detail.dto';

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
    body: PostBatchCatalogProductDto,
  ): Promise<CatalogSearchResultGroup[]> {
    const cleanBody: PostBatchCatalogProductDto = {
      ...body,
      whatsapp: this.toE164(body.whatsapp),
    };

    if (cleanBody.terminos.length === 0) return [];

    const response = await this.coreApiClient.post<CatalogSearchResponse>(
      '/inventario/productos/buscar',
      token,
      {
        emisorId: cleanBody.emisorId,
        whatsapp: cleanBody.whatsapp,
        termino: cleanBody.terminos,
      },
    );
    return response.data;
  }

  async getDetalles(
    token: CoreApiUserToken,
    body: PostProductDetailDto,
  ): Promise<ProductoDetalle[]> {
    const cleanBody: PostProductDetailDto = {
      ...body,
      whatsapp: this.toE164(body.whatsapp),
    };

    if (cleanBody.items.length === 0) return [];

    const response = await this.coreApiClient.post<ProductoDetallesResponse>(
      '/inventario/productos/detalles',
      token,
      cleanBody,
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
