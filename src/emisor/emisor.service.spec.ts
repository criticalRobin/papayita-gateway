import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { EmisorService } from './emisor.service';

function makeCoreApiClient(get: jest.Mock): CoreApiClient {
  return { get } as unknown as CoreApiClient;
}

describe('EmisorService', () => {
  const token = 'access-1' as CoreApiUserToken;

  it('fetches the emisor by id and maps the SRI-facing profile fields', async () => {
    const get = jest.fn().mockResolvedValue({
      id: 'emisor-1',
      ruc: '1850137918001',
      razonSocial: 'Mati Prueba',
      nombreComercial: 'Nukay',
      direccionMatriz: 'Pillaro',
      obligadoContabilidad: true,
      contribuyenteEspecial: 'NO',
      agenteRetencion: 'NO',
      contribuyenteRimpe: true,
      ambiente: '1',
      estado: 'activo',
      tenantId: 'tenant-1',
      whatsapp: '+593993908744',
      tieneCertificado: true,
      certificadoValidoHasta: null,
      certificadoSujeto: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const service = new EmisorService(makeCoreApiClient(get));

    const profile = await service.getProfile(token, 'emisor-1');

    expect(get).toHaveBeenCalledWith('/emisores/emisor-1', token);
    expect(profile).toEqual({
      ruc: '1850137918001',
      razonSocial: 'Mati Prueba',
      nombreComercial: 'Nukay',
      dirMatriz: 'Pillaro',
      establecimiento: '001',
      puntoEmision: '001',
      obligadoContabilidad: 'SI',
      contribuyenteEspecial: 'NO',
      agenteRetencion: 'NO',
      contribuyenteRimpe: 'CONTRIBUYENTE RÉGIMEN RIMPE',
    });
  });

  it('maps falsy obligadoContabilidad/contribuyenteRimpe and empty strings to "NO"/null', async () => {
    const get = jest.fn().mockResolvedValue({
      id: 'emisor-1',
      ruc: '1850137918001',
      razonSocial: 'Mati Prueba',
      nombreComercial: null,
      direccionMatriz: 'Pillaro',
      obligadoContabilidad: false,
      contribuyenteEspecial: '',
      agenteRetencion: '',
      contribuyenteRimpe: false,
      ambiente: '1',
      estado: 'activo',
      tenantId: 'tenant-1',
      whatsapp: '+593993908744',
      tieneCertificado: false,
      certificadoValidoHasta: null,
      certificadoSujeto: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const service = new EmisorService(makeCoreApiClient(get));

    const profile = await service.getProfile(token, 'emisor-1');

    expect(profile.obligadoContabilidad).toBe('NO');
    expect(profile.contribuyenteEspecial).toBeNull();
    expect(profile.agenteRetencion).toBeNull();
    expect(profile.contribuyenteRimpe).toBeNull();
  });
});
