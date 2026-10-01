import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import {
  RetryableCoreApiError,
  TerminalCoreApiError,
} from '../core-api/core-api.errors';
import { PersonaNotFoundError } from './persona.errors';
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

  it("throws PersonaNotFoundError carrying Core API's message on a 404", async () => {
    const coreApiMessage =
      'La persona con identificación "1850137930" no existe en el SRI. Verifique el número de cedula o RUC.';
    const get = jest
      .fn()
      .mockRejectedValue(
        new TerminalCoreApiError('not found', 404, coreApiMessage),
      );
    const service = new PersonaService(makeCoreApiClient(get));

    const promise = service.findByIdentificacion(token, '1850137930');

    await expect(promise).rejects.toThrow(PersonaNotFoundError);
    await expect(promise).rejects.toThrow(coreApiMessage);
  });

  it('falls back to a generic message on a 404 without a Core API message', async () => {
    const get = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('not found', 404));
    const service = new PersonaService(makeCoreApiClient(get));

    await expect(
      service.findByIdentificacion(token, '0000000000'),
    ).rejects.toThrow('No se encontro información del cliente');
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

  it('turns a Core API 502 (SRI rejected the number) into PersonaNotFoundError instead of retrying', async () => {
    const get = jest
      .fn()
      .mockRejectedValue(new RetryableCoreApiError('bad gateway', 502));
    const service = new PersonaService(makeCoreApiClient(get));

    const promise = service.findByIdentificacion(token, '1850137918');

    await expect(promise).rejects.toThrow(PersonaNotFoundError);
    await expect(promise).rejects.toThrow('No pude verificar');
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
