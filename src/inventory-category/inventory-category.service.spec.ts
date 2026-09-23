import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { InventoryCategoryService } from './inventory-category.service';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import type { InventoryCategory } from './domain/inventory-category';

const TOKEN = 'token' as CoreApiUserToken;
const EMISOR_ID = 'emisor-1';

function makeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    del: jest.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0)),
  } as unknown as Redis;
}

function makeConfig(): ConfigService {
  return { get: () => 86400 } as unknown as ConfigService;
}

function makeCategory(
  overrides: Partial<InventoryCategory> = {},
): InventoryCategory {
  return {
    id: 'cat-1',
    emisorId: EMISOR_ID,
    categoriaPadreId: null,
    nombre: 'Entretenimiento',
    activo: true,
    createdAt: new Date().toISOString(),
    totalProductos: 0,
    totalSubcategorias: 0,
    ...overrides,
  };
}

describe('InventoryCategoryService', () => {
  it('fetches from Core API and caches on a miss', async () => {
    const redis = makeRedis();
    const categories = [makeCategory()];
    const get = jest.fn().mockResolvedValue(categories);
    const coreApiClient = { get } as unknown as CoreApiClient;
    const service = new InventoryCategoryService(
      coreApiClient,
      redis,
      makeConfig(),
    );

    const result = await service.findAll(TOKEN, EMISOR_ID);

    expect(get).toHaveBeenCalledWith(
      `/inventario/categorias?emisorId=${EMISOR_ID}`,
      TOKEN,
    );
    expect(result).toEqual(categories);
    expect(redis.set).toHaveBeenCalledWith(
      `inventory-category:${EMISOR_ID}`,
      JSON.stringify(categories),
      'EX',
      86400,
    );
  });

  it('returns the cached list without calling Core API on a hit', async () => {
    const redis = makeRedis();
    const categories = [makeCategory()];
    await redis.set(
      `inventory-category:${EMISOR_ID}`,
      JSON.stringify(categories),
      'EX',
      86400,
    );
    const get = jest.fn();
    const coreApiClient = { get } as unknown as CoreApiClient;
    const service = new InventoryCategoryService(
      coreApiClient,
      redis,
      makeConfig(),
    );

    const result = await service.findAll(TOKEN, EMISOR_ID);

    expect(get).not.toHaveBeenCalled();
    expect(result).toEqual(categories);
  });

  it('create() posts to Core API then refreshes the cache', async () => {
    const redis = makeRedis();
    const created = makeCategory({ id: 'cat-new' });
    const refreshed = [makeCategory(), created];
    const post = jest.fn().mockResolvedValue(created);
    const get = jest.fn().mockResolvedValue(refreshed);
    const coreApiClient = { post, get } as unknown as CoreApiClient;
    const service = new InventoryCategoryService(
      coreApiClient,
      redis,
      makeConfig(),
    );

    const result = await service.create(TOKEN, EMISOR_ID, {
      nombre: 'Nueva',
      categoriaPadreId: null,
      descripcion: undefined as unknown as string,
    });

    expect(post).toHaveBeenCalledWith(
      '/inventario/categorias',
      TOKEN,
      expect.objectContaining({ nombre: 'Nueva', emisorId: EMISOR_ID }),
    );
    expect(get).toHaveBeenCalled(); // cache refresh
    expect(result).toEqual(created);
    expect(
      JSON.parse(
        (await redis.get(`inventory-category:${EMISOR_ID}`)) as string,
      ),
    ).toEqual(refreshed);
  });

  it('delete() removes from Core API then refreshes the deleted category emisor cache', async () => {
    const redis = makeRedis();
    const redisDel = jest.spyOn(redis, 'del');
    const deleted = makeCategory({ id: 'cat-1' });
    const del = jest.fn().mockResolvedValue(deleted);
    const get = jest.fn().mockResolvedValue([]);
    const coreApiClient = { delete: del, get } as unknown as CoreApiClient;
    const service = new InventoryCategoryService(
      coreApiClient,
      redis,
      makeConfig(),
    );

    const result = await service.delete(TOKEN, EMISOR_ID, 'cat-1');

    expect(del).toHaveBeenCalledWith(
      `/inventario/categorias/cat-1?emisorId=${EMISOR_ID}`,
      TOKEN,
    );
    expect(get).toHaveBeenCalledWith(
      `/inventario/categorias?emisorId=${EMISOR_ID}`,
      TOKEN,
    );
    expect(redisDel).toHaveBeenCalledWith(`inventory-product:${EMISOR_ID}`);
    expect(result).toEqual(deleted);
  });
});
