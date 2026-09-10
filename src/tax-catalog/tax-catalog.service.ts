import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { TaxCatalogClient } from './tax-catalog-client.interface';
import { Impuesto } from './domain/tax';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import { CoreApiUserToken } from '../core-api/core-api-token';

export const TAX_CATALOG_REDIS_CLIENT = 'TAX_CATALOG_REDIS_CLIENT';
export const TAX_CATALOG_CLIENT = 'TAX_CATALOG_CLIENT';

interface ImpuestosResponse {
  impuestos: Impuesto[];
}

// Global catalog — SRI's fixed tax list, not emisor-specific — one Redis
// key shared across every emisor.
const TAX_CATALOG_KEY = 'tax-catalog:impuestos';

@Injectable()
export class TaxCatalogService implements TaxCatalogClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
    @Inject(TAX_CATALOG_REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async findAll(token: CoreApiUserToken): Promise<Impuesto[]> {
    const cached = await this.redis.get(TAX_CATALOG_KEY);
    if (cached) {
      return JSON.parse(cached) as Impuesto[];
    }

    const response = await this.coreApiClient.get<ImpuestosResponse>(
      '/catalogos/impuestos',
      token,
    );
    const ttl = this.config.get<number>(
      'TAX_CATALOG_CACHE_TTL_SECONDS',
      604800,
    );
    await this.redis.set(
      TAX_CATALOG_KEY,
      JSON.stringify(response.impuestos),
      'EX',
      ttl,
    );
    return response.impuestos;
  }
}
