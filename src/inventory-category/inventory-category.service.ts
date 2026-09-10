import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { InventoryCategoryClient } from './inventory-category-client.interface';
import { InventoryCategory } from './domain/inventory-category';
import { CreateOrUpdateInventoryCategoryDto } from './dto/create-or-update-inventory-category.dto';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import { CoreApiUserToken } from '../core-api/core-api-token';

export const INVENTORY_CATEGORY_REDIS_CLIENT =
  'INVENTORY_CATEGORY_REDIS_CLIENT';
export const INVENTORY_CATEGORY_CLIENT = 'INVENTORY_CATEGORY_CLIENT';

@Injectable()
export class InventoryCategoryService implements InventoryCategoryClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
    @Inject(INVENTORY_CATEGORY_REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async findAll(
    token: CoreApiUserToken,
    emisorId: string,
  ): Promise<InventoryCategory[]> {
    const cached = await this.redis.get(this.key(emisorId));
    if (cached) {
      return JSON.parse(cached) as InventoryCategory[];
    }

    return this.refresh(token, emisorId);
  }

  async create(
    token: CoreApiUserToken,
    emisorId: string,
    data: CreateOrUpdateInventoryCategoryDto,
  ): Promise<InventoryCategory> {
    const created = await this.coreApiClient.post<InventoryCategory>(
      `/inventario/categorias`,
      token,
      { ...data, emisorId },
    );
    await this.refresh(token, emisorId);
    return created;
  }

  async update(
    token: CoreApiUserToken,
    emisorId: string,
    categoryId: string,
    data: CreateOrUpdateInventoryCategoryDto,
  ): Promise<InventoryCategory> {
    const updated = await this.coreApiClient.update<InventoryCategory>(
      `/inventario/categorias/${categoryId}`,
      token,
      { ...data, emisorId },
    );
    await this.refresh(token, emisorId);
    return updated;
  }

  async delete(
    token: CoreApiUserToken,
    categoryId: string,
  ): Promise<InventoryCategory> {
    const deleted = await this.coreApiClient.delete<InventoryCategory>(
      `/inventario/categorias/${categoryId}`,
      token,
    );
    await this.refresh(token, deleted.emisorId);
    return deleted;
  }

  // Re-fetches the full list from Core API and overwrites the cache —
  // called on every write so the webview always reads fresh data next time,
  // and as the cache-miss path for findAll.
  private async refresh(
    token: CoreApiUserToken,
    emisorId: string,
  ): Promise<InventoryCategory[]> {
    const categories = await this.coreApiClient.get<InventoryCategory[]>(
      `/inventario/categorias?emisorId=${emisorId}`,
      token,
    );
    const ttl = this.config.get<number>('INVENTORY_CACHE_TTL_SECONDS', 86400);
    await this.redis.set(
      this.key(emisorId),
      JSON.stringify(categories),
      'EX',
      ttl,
    );
    return categories;
  }

  private key(emisorId: string): string {
    return `inventory-category:${emisorId}`;
  }
}
