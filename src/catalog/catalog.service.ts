import { Inject, Injectable } from '@nestjs/common';
import { toE164 } from '../common/phone';
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
      whatsapp: toE164(body.whatsapp),
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
      whatsapp: toE164(body.whatsapp),
    };

    if (cleanBody.items.length === 0) return [];

    const response = await this.coreApiClient.post<ProductoDetallesResponse>(
      '/inventario/productos/detalles',
      token,
      cleanBody,
    );
    return response.data.detalles;
  }
}
