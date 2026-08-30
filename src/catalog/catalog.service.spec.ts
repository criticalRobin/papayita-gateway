import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { CatalogService } from './catalog.service';

function makeCoreApiClient(post: jest.Mock): CoreApiClient {
  return { post } as unknown as CoreApiClient;
}

describe('CatalogService', () => {
  const token = 'access-1' as CoreApiUserToken;

  it('sends a single batched request for every term and returns the grouped results', async () => {
    const post = jest.fn().mockResolvedValue({
      success: true,
      data: [
        { termino: 'play station 5', productos: [{ id: 'p1' }] },
        { termino: 'funko pop naruto', productos: [] },
      ],
    });
    const service = new CatalogService(makeCoreApiClient(post));

    const result = await service.searchBatch(token, '+593993908744', [
      'play station 5',
      'funko pop naruto',
    ]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/inventario/productos/buscar', token, {
      whatsapp: '+593993908744',
      termino: ['play station 5', 'funko pop naruto'],
    });
    expect(result).toEqual([
      { termino: 'play station 5', productos: [{ id: 'p1' }] },
      { termino: 'funko pop naruto', productos: [] },
    ]);
  });

  it('prepends "+" when the phone number arrives as bare digits (Meta\'s wa_id format)', async () => {
    const post = jest.fn().mockResolvedValue({ success: true, data: [] });
    const service = new CatalogService(makeCoreApiClient(post));

    await service.searchBatch(token, '593993908744', ['coca cola']);

    expect(post).toHaveBeenCalledWith('/inventario/productos/buscar', token, {
      whatsapp: '+593993908744',
      termino: ['coca cola'],
    });
  });

  it('short-circuits to an empty array without calling Core API when there are no terms', async () => {
    const post = jest.fn();
    const service = new CatalogService(makeCoreApiClient(post));

    const result = await service.searchBatch(token, '+593993908744', []);

    expect(result).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  describe('getDetalles', () => {
    it('sends the confirmed items and returns the priced/taxed detalles', async () => {
      const detalle = {
        codigoPrincipal: 'CONS-PS5-01',
        codigoAuxiliar: 'SONY-001',
        descripcion: 'Consola Sony PlayStation 5',
        unidadMedida: 'Unidad',
        cantidad: 1,
        precioUnitario: 499.99,
        descuento: 0,
        impuestos: [
          {
            codigo: '2',
            codigoPorcentaje: '4',
            tarifa: 15,
            baseImponible: 499.99,
            valor: 75,
          },
        ],
      };
      const post = jest.fn().mockResolvedValue({
        success: true,
        data: { detalles: [detalle] },
      });
      const service = new CatalogService(makeCoreApiClient(post));

      const result = await service.getDetalles(token, '+593993908744', [
        {
          productoId: 'c5948014-f491-4eb0-923d-52e03b0413a6',
          cantidad: 1,
          descuento: 0,
        },
      ]);

      expect(post).toHaveBeenCalledWith(
        '/inventario/productos/detalles',
        token,
        {
          whatsapp: '+593993908744',
          items: [
            {
              productoId: 'c5948014-f491-4eb0-923d-52e03b0413a6',
              cantidad: 1,
              descuento: 0,
            },
          ],
        },
      );
      expect(result).toEqual([detalle]);
    });

    it('prepends "+" when the phone number arrives as bare digits', async () => {
      const post = jest
        .fn()
        .mockResolvedValue({ success: true, data: { detalles: [] } });
      const service = new CatalogService(makeCoreApiClient(post));

      await service.getDetalles(token, '593993908744', [
        { productoId: 'p1', cantidad: 1, descuento: 0 },
      ]);

      expect(post).toHaveBeenCalledWith(
        '/inventario/productos/detalles',
        token,
        expect.objectContaining({ whatsapp: '+593993908744' }),
      );
    });

    it('short-circuits to an empty array without calling Core API when there are no items', async () => {
      const post = jest.fn();
      const service = new CatalogService(makeCoreApiClient(post));

      const result = await service.getDetalles(token, '+593993908744', []);

      expect(result).toEqual([]);
      expect(post).not.toHaveBeenCalled();
    });
  });
});
