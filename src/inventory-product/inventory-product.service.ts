import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { InventoryProductClient } from './inventory-product-client.interface';
import {
  InventoryProduct,
  InventoryProductPage,
} from './domain/inventory-product';
import { CreateOrUpdateInventoryProductDto } from './dto/create-or-update-inventory-product.dto';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import { CoreApiUserToken } from '../core-api/core-api-token';
import { INVENTORY_CATEGORY_CLIENT } from '../inventory-category/inventory-category.service';
import type { InventoryCategoryClient } from '../inventory-category/inventory-category-client.interface';
import { TAX_CATALOG_CLIENT } from '../tax-catalog/tax-catalog.service';
import type { TaxCatalogClient } from '../tax-catalog/tax-catalog-client.interface';
import { hasCodigoPorcentaje } from '../tax-catalog/domain/tax';
import { inventoryProductCacheKey } from './inventory-product-cache-key';

export const INVENTORY_PRODUCT_REDIS_CLIENT = 'INVENTORY_PRODUCT_REDIS_CLIENT';
export const INVENTORY_PRODUCT_CLIENT = 'INVENTORY_PRODUCT_CLIENT';

const PAGE_LIMIT = 100;

@Injectable()
export class InventoryProductService implements InventoryProductClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
    @Inject(INVENTORY_CATEGORY_CLIENT)
    private readonly inventoryCategoryClient: InventoryCategoryClient,
    @Inject(TAX_CATALOG_CLIENT)
    private readonly taxCatalogClient: TaxCatalogClient,
    @Inject(INVENTORY_PRODUCT_REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async findAll(
    token: CoreApiUserToken,
    emisorId: string,
  ): Promise<InventoryProduct[]> {
    const cached = await this.redis.get(this.key(emisorId));
    if (cached) {
      return JSON.parse(cached) as InventoryProduct[];
    }

    return this.refresh(token, emisorId);
  }

  async create(
    token: CoreApiUserToken,
    emisorId: string,
    data: CreateOrUpdateInventoryProductDto,
  ): Promise<InventoryProduct> {
    await this.validateReferences(token, emisorId, data);
    const created = await this.coreApiClient.post<InventoryProduct>(
      `/inventario/productos`,
      token,
      { ...data, emisorId },
    );
    await this.refresh(token, emisorId);
    return created;
  }

  async update(
    token: CoreApiUserToken,
    emisorId: string,
    productId: string,
    data: CreateOrUpdateInventoryProductDto,
  ): Promise<InventoryProduct> {
    await this.validateReferences(token, emisorId, data);
    const updated = await this.coreApiClient.update<InventoryProduct>(
      `/inventario/productos/${productId}`,
      token,
      { ...data, emisorId },
    );
    await this.refresh(token, emisorId);
    return updated;
  }

  async delete(
    token: CoreApiUserToken,
    emisorId: string,
    productId: string,
  ): Promise<InventoryProduct> {
    const deleted = await this.coreApiClient.delete<InventoryProduct>(
      `/inventario/productos/${productId}?emisorId=${emisorId}`,
      token,
    );
    await this.refresh(token, emisorId);
    return deleted;
  }

  // Two-layer defense for webview-submitted data: the DTO already validated
  // shape/types, this re-validates the references against the real cached
  // catalogs before spending a Core API round trip. impuestoId/codigoIce are
  // passed through untouched — Core API remains final authority for fields
  // the gateway has no cached catalog to check them against.
  private async validateReferences(
    token: CoreApiUserToken,
    emisorId: string,
    data: CreateOrUpdateInventoryProductDto,
  ): Promise<void> {
    if (data.categoriaId) {
      const categories = await this.inventoryCategoryClient.findAll(
        token,
        emisorId,
      );
      const exists = categories.some((c) => c.id === data.categoriaId);
      if (!exists) {
        throw new BadRequestException('Categoría no válida.');
      }
    }

    const impuestos = await this.taxCatalogClient.findAll(token);
    if (!hasCodigoPorcentaje(impuestos, '2', data.codigoPorcentajeIva)) {
      throw new BadRequestException('Código de IVA no válido.');
    }
  }

  // Core API paginates GET /inventario/productos — the webview wants the
  // whole catalog at once, so the gateway pages through it internally and
  // caches the flattened result.
  private async refresh(
    token: CoreApiUserToken,
    emisorId: string,
  ): Promise<InventoryProduct[]> {
    const products: InventoryProduct[] = [];
    let cursor: string | null = null;

    do {
      const query = new URLSearchParams({
        emisorId,
        limit: String(PAGE_LIMIT),
      });
      if (cursor) query.set('cursor', cursor);

      const page = await this.coreApiClient.get<InventoryProductPage>(
        `/inventario/productos?${query.toString()}`,
        token,
      );
      products.push(...page.data);
      cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor);

    const ttl = this.config.get<number>('INVENTORY_CACHE_TTL_SECONDS', 86400);
    await this.redis.set(
      this.key(emisorId),
      JSON.stringify(products),
      'EX',
      ttl,
    );
    return products;
  }

  private key(emisorId: string): string {
    return inventoryProductCacheKey(emisorId);
  }
}
