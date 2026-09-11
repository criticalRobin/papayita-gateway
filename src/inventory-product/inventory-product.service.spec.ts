import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { InventoryProductService } from './inventory-product.service';
import { TipoProducto } from './domain/inventory-product';
import type {
  InventoryProduct,
  InventoryProductPage,
} from './domain/inventory-product';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import type { InventoryCategoryClient } from '../inventory-category/inventory-category-client.interface';
import type { InventoryCategory } from '../inventory-category/domain/inventory-category';
import type { TaxCatalogClient } from '../tax-catalog/tax-catalog-client.interface';
import type { Impuesto } from '../tax-catalog/domain/tax';
import type { CreateOrUpdateInventoryProductDto } from './dto/create-or-update-inventory-product.dto';

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
  } as unknown as Redis;
}

function makeConfig(): ConfigService {
  return { get: () => 86400 } as unknown as ConfigService;
}

function makeProduct(
  overrides: Partial<InventoryProduct> = {},
): InventoryProduct {
  return {
    id: 'prod-1',
    emisorId: EMISOR_ID,
    categoriaId: null,
    categoriaNombre: null,
    tipo: TipoProducto.BIEN,
    codigoPrincipal: 'COD-1',
    codigoAuxiliar: null,
    nombre: 'Producto',
    descripcion: null,
    palabrasParecidas: [],
    unidadMedidaId: null,
    unidadMedidaTexto: null,
    manejaInventario: true,
    requiereLote: false,
    precioUnitario: 10,
    costoReferencial: 5,
    aplicaIva: true,
    codigoPorcentajeIva: '2',
    aplicaIce: false,
    codigoIce: null,
    impuestoId: null,
    stockMinimo: 5,
    estado: 'ACTIVO',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const validImpuestos: Impuesto[] = [
  {
    codigo: '2',
    nombre: 'IVA',
    tarifas: [
      { codigoPorcentaje: '2', descripcion: 'IVA 12%', porcentaje: 12 },
    ],
  },
];

function makeDto(
  overrides: Partial<CreateOrUpdateInventoryProductDto> = {},
): CreateOrUpdateInventoryProductDto {
  return {
    tipo: TipoProducto.BIEN,
    codigoPrincipal: 'COD-1',
    nombre: 'Producto',
    manejaInventario: true,
    aplicaIva: true,
    codigoPorcentajeIva: '2',
    aplicaIce: false,
    ...overrides,
  };
}

function makeService(overrides?: {
  get?: jest.Mock;
  post?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
  categories?: InventoryCategory[];
  impuestos?: Impuesto[];
}) {
  const redis = makeRedis();
  const get =
    overrides?.get ??
    jest.fn().mockResolvedValue({
      data: [],
      nextCursor: null,
      hasMore: false,
    });
  const coreApiClient = {
    get,
    post: overrides?.post ?? jest.fn(),
    update: overrides?.update ?? jest.fn(),
    delete: overrides?.delete ?? jest.fn(),
  } as unknown as CoreApiClient;
  const findAllCategories = jest
    .fn()
    .mockResolvedValue(overrides?.categories ?? []);
  const inventoryCategoryClient = {
    findAll: findAllCategories,
  } as unknown as InventoryCategoryClient;
  const findAllTaxes = jest
    .fn()
    .mockResolvedValue(overrides?.impuestos ?? validImpuestos);
  const taxCatalogClient = {
    findAll: findAllTaxes,
  } as unknown as TaxCatalogClient;

  const service = new InventoryProductService(
    coreApiClient,
    inventoryCategoryClient,
    taxCatalogClient,
    redis,
    makeConfig(),
  );

  return {
    service,
    redis,
    coreApiClient,
    findAllCategories,
    findAllTaxes,
    get,
  };
}

describe('InventoryProductService', () => {
  describe('findAll', () => {
    it('pages through Core API and flattens the result into the cache on a miss', async () => {
      const page1: InventoryProductPage = {
        data: [makeProduct({ id: 'p1' })],
        nextCursor: 'cursor-1',
        hasMore: true,
      };
      const page2: InventoryProductPage = {
        data: [makeProduct({ id: 'p2' })],
        nextCursor: null,
        hasMore: false,
      };
      const get = jest
        .fn()
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);
      const { service, redis } = makeService({ get });

      const result = await service.findAll(TOKEN, EMISOR_ID);

      expect(get).toHaveBeenCalledTimes(2);
      expect(result.map((p) => p.id)).toEqual(['p1', 'p2']);
      expect(
        JSON.parse(
          (await redis.get(`inventory-product:${EMISOR_ID}`)) as string,
        ),
      ).toHaveLength(2);
    });

    it('returns the cached list without calling Core API on a hit', async () => {
      const { service, redis, get } = makeService();
      await redis.set(
        `inventory-product:${EMISOR_ID}`,
        JSON.stringify([makeProduct()]),
        'EX',
        86400,
      );

      const result = await service.findAll(TOKEN, EMISOR_ID);

      expect(get).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('rejects a categoriaId that does not exist in the cached categories', async () => {
      const { service } = makeService({ categories: [] });

      await expect(
        service.create(TOKEN, EMISOR_ID, makeDto({ categoriaId: 'missing' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a codigoPorcentajeIva that does not exist in the IVA tariffs', async () => {
      const { service } = makeService({ impuestos: [] });

      await expect(
        service.create(
          TOKEN,
          EMISOR_ID,
          makeDto({ codigoPorcentajeIva: '99' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates via Core API and refreshes the cache when references are valid', async () => {
      const created = makeProduct({ id: 'new' });
      const post = jest.fn().mockResolvedValue(created);
      const category: InventoryCategory = {
        id: 'cat-1',
        emisorId: EMISOR_ID,
        categoriaPadreId: null,
        nombre: 'Cat',
        activo: true,
        createdAt: new Date().toISOString(),
        totalProductos: 0,
        totalSubcategorias: 0,
      };
      const { service, coreApiClient } = makeService({
        post,
        categories: [category],
      });

      const result = await service.create(
        TOKEN,
        EMISOR_ID,
        makeDto({ categoriaId: 'cat-1' }),
      );

      expect(post).toHaveBeenCalledWith(
        '/inventario/productos',
        TOKEN,
        expect.objectContaining({ categoriaId: 'cat-1', emisorId: EMISOR_ID }),
      );
      expect(coreApiClient.get).toHaveBeenCalled(); // cache refresh
      expect(result).toEqual(created);
    });
  });

  describe('delete', () => {
    it('deletes via Core API and refreshes the deleted product emisor cache', async () => {
      const deleted = makeProduct({ id: 'prod-1' });
      const del = jest.fn().mockResolvedValue(deleted);
      const { service, coreApiClient } = makeService({ delete: del });

      const result = await service.delete(TOKEN, 'prod-1');

      expect(del).toHaveBeenCalledWith('/inventario/productos/prod-1', TOKEN);
      expect(coreApiClient.get).toHaveBeenCalled();
      expect(result).toEqual(deleted);
    });
  });
});
