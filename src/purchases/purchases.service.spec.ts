import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { TerminalCoreApiError } from '../core-api/core-api.errors';
import { PurchasesService } from './purchases.service';
import type { PurchaseRegisteredResponse } from './purchases-client.interface';

function makeCoreApiClient(post: jest.Mock): CoreApiClient {
  return { post } as unknown as CoreApiClient;
}

describe('PurchasesService', () => {
  const token = 'access-1' as CoreApiUserToken;
  const xml = '<factura></factura>';

  const successResponse: PurchaseRegisteredResponse = {
    id: '2adfb24f-8ff2-4e5c-8850-32d94ba75aab',
    emisorId: 'd0dd79ec-7f67-426d-b5a5-c7881fe50099',
    proveedorRuc: '1850137918001',
    proveedorRazonSocial: 'MATIAS TITE',
    tipoComprobante: '01',
    establecimiento: '001',
    puntoEmision: '001',
    secuencial: '000000049',
    claveAcceso: '1609202601185013791800110010010000000499131334912',
    fechaEmision: '2026-09-16',
    totalSinImpuestos: 194.47,
    importeTotal: 223.65,
    moneda: 'DOLAR',
    totales: [
      {
        codigo: '2',
        codigoPorcentaje: '4',
        baseImponible: 194.47,
        tarifa: 15,
        valor: 29.18,
      },
    ],
    createdAt: '2026-09-16T20:31:01.826Z',
  };

  it('posts the raw XML with an application/xml content type and returns the record', async () => {
    const post = jest.fn().mockResolvedValue(successResponse);
    const service = new PurchasesService(makeCoreApiClient(post));

    const result = await service.registrarXml(token, xml);

    expect(post).toHaveBeenCalledWith('/compras/xml', token, xml, {
      'Content-Type': 'application/xml',
    });
    expect(result).toEqual(successResponse);
  });

  it('throws a TerminalCoreApiError when Core API responds 200 with success: false', async () => {
    const post = jest.fn().mockResolvedValue({
      success: false,
      error:
        'Esta factura no está dirigida a ningún emisor al que tengas acceso',
    });
    const service = new PurchasesService(makeCoreApiClient(post));

    await expect(service.registrarXml(token, xml)).rejects.toThrow(
      TerminalCoreApiError,
    );
  });

  it('propagates a terminal error thrown by the HTTP layer', async () => {
    const post = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('bad request', 400));
    const service = new PurchasesService(makeCoreApiClient(post));

    await expect(service.registrarXml(token, xml)).rejects.toThrow(
      TerminalCoreApiError,
    );
  });
});
