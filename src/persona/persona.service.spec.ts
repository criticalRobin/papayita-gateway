import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import {
  RetryableCoreApiError,
  TerminalCoreApiError,
} from '../core-api/core-api.errors';
import { PersonaService } from './persona.service';

function makeCoreApiClient(get: jest.Mock): CoreApiClient {
  return { get } as unknown as CoreApiClient;
}

describe('PersonaService', () => {
  const token = 'access-1' as CoreApiUserToken;

  it('returns the persona record on a successful lookup', async () => {
    const record = {
      id: 'p1',
      tipoIdentificacion: '05',
      identificacion: '1850137918',
      razonSocial: 'TITE HARO RAMIRO MATIAS',
      direccion: null,
      telefono: null,
      email: null,
    };
    const get = jest.fn().mockResolvedValue(record);
    const service = new PersonaService(makeCoreApiClient(get));

    const result = await service.findByIdentificacion(token, '1850137918');

    expect(get).toHaveBeenCalledWith('/personas/buscar/1850137918', token);
    expect(result).toEqual(record);
  });

  it('returns null on a 404 (not found is expected, not an error)', async () => {
    const get = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('not found', 404));
    const service = new PersonaService(makeCoreApiClient(get));

    const result = await service.findByIdentificacion(token, '0000000000');

    expect(result).toBeNull();
  });

  it('re-throws a terminal error that is not a 404', async () => {
    const get = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('bad request', 400));
    const service = new PersonaService(makeCoreApiClient(get));

    await expect(
      service.findByIdentificacion(token, '1850137918'),
    ).rejects.toThrow(TerminalCoreApiError);
  });

  it('re-throws a retryable error', async () => {
    const get = jest
      .fn()
      .mockRejectedValue(new RetryableCoreApiError('network blip'));
    const service = new PersonaService(makeCoreApiClient(get));

    await expect(
      service.findByIdentificacion(token, '1850137918'),
    ).rejects.toThrow(RetryableCoreApiError);
  });
});
