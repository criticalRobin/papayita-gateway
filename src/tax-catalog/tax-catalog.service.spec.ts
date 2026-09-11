import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { TaxCatalogService } from './tax-catalog.service';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import type { Impuesto } from './domain/tax';

const TOKEN = 'token' as CoreApiUserToken;

function makeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  } as unknown as Redis;
}

function makeConfig(): ConfigService {
  return { get: () => 604800 } as unknown as ConfigService;
}

const impuestos: Impuesto[] = [
  {
    codigo: '2',
    nombre: 'IVA',
    tarifas: [
      { codigoPorcentaje: '2', descripcion: 'IVA 12%', porcentaje: 12 },
    ],
  },
];

describe('TaxCatalogService', () => {
  it('fetches from Core API and caches globally (no emisorId) on a miss', async () => {
    const redis = makeRedis();
    const get = jest.fn().mockResolvedValue({ impuestos });
    const coreApiClient = { get } as unknown as CoreApiClient;
    const service = new TaxCatalogService(coreApiClient, redis, makeConfig());

    const result = await service.findAll(TOKEN);

    expect(get).toHaveBeenCalledWith('/catalogos/impuestos', TOKEN);
    expect(result).toEqual(impuestos);
    expect(redis.set).toHaveBeenCalledWith(
      'tax-catalog:impuestos',
      JSON.stringify(impuestos),
      'EX',
      604800,
    );
  });

  it('returns the cached catalog without calling Core API on a hit', async () => {
    const redis = makeRedis();
    await redis.set(
      'tax-catalog:impuestos',
      JSON.stringify(impuestos),
      'EX',
      604800,
    );
    const get = jest.fn();
    const coreApiClient = { get } as unknown as CoreApiClient;
    const service = new TaxCatalogService(coreApiClient, redis, makeConfig());

    const result = await service.findAll(TOKEN);

    expect(get).not.toHaveBeenCalled();
    expect(result).toEqual(impuestos);
  });
});
