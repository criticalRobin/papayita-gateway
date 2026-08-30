import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { CoreApiHttpService } from './core-api-http.service';
import { RetryableCoreApiError, TerminalCoreApiError } from './core-api.errors';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

function axiosError(status: number): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    statusText: 'error',
    data: { error: 'bad request' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });
}

describe('CoreApiHttpService', () => {
  const config = makeConfig({ CORE_API_BASE_URL: 'https://core-api.test' });

  describe('login', () => {
    it('posts credentials and returns the token set', async () => {
      const post = jest.fn().mockReturnValueOnce(
        of({
          data: {
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
            expiresAt: '2026-01-01T00:00:00.000Z',
            user: { emisorId: 'emisor-1' },
          },
        }),
      );
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      const result = await service.login('user@empresa.com', 'secret');

      expect(post).toHaveBeenCalledWith('https://core-api.test/auth/login', {
        email: 'user@empresa.com',
        password: 'secret',
      });
      expect(result).toEqual({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        emisorId: 'emisor-1',
      });
    });

    it('maps a 401 (bad credentials) to TerminalCoreApiError', async () => {
      const post = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(401)));
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      await expect(service.login('user@empresa.com', 'wrong')).rejects.toThrow(
        TerminalCoreApiError,
      );
    });

    it('maps a 5xx to RetryableCoreApiError', async () => {
      const post = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(503)));
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      await expect(service.login('user@empresa.com', 'secret')).rejects.toThrow(
        RetryableCoreApiError,
      );
    });

    it('maps a network error (no response) to RetryableCoreApiError', async () => {
      const post = jest
        .fn()
        .mockReturnValueOnce(
          throwError(() => new AxiosError('timeout', 'ECONNABORTED')),
        );
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      await expect(service.login('user@empresa.com', 'secret')).rejects.toThrow(
        RetryableCoreApiError,
      );
    });
  });

  describe('refresh', () => {
    it('posts the refresh token and returns the new token set', async () => {
      const post = jest.fn().mockReturnValueOnce(
        of({
          data: {
            accessToken: 'access-2',
            refreshToken: 'refresh-2',
            expiresAt: '2026-01-02T00:00:00.000Z',
            user: { emisorId: 'emisor-1' },
          },
        }),
      );
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      const result = await service.refresh('refresh-1');

      expect(post).toHaveBeenCalledWith('https://core-api.test/auth/refresh', {
        refreshToken: 'refresh-1',
      });
      expect(result.accessToken).toBe('access-2');
    });

    it('maps a 400 (invalid refresh token) to TerminalCoreApiError', async () => {
      const post = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(400)));
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      await expect(service.refresh('expired')).rejects.toThrow(
        TerminalCoreApiError,
      );
    });
  });

  describe('post', () => {
    const token = 'access-1' as import('./core-api-token').CoreApiUserToken;

    it('sends a bearer-authorized POST and returns the response body', async () => {
      const post = jest.fn().mockReturnValueOnce(of({ data: { ok: true } }));
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      const result = await service.post('/inventario/productos/buscar', token, {
        whatsapp: '+593993908744',
        termino: ['coca cola'],
      });

      expect(post).toHaveBeenCalledWith(
        'https://core-api.test/inventario/productos/buscar',
        { whatsapp: '+593993908744', termino: ['coca cola'] },
        { headers: { Authorization: 'Bearer access-1' } },
      );
      expect(result).toEqual({ ok: true });
    });

    it('maps a 5xx to a RetryableCoreApiError carrying the status', async () => {
      const post = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(503)));
      const httpService = { post } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      await expect(
        service.post('/inventario/productos/buscar', token, {}),
      ).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('get', () => {
    const token = 'access-1' as import('./core-api-token').CoreApiUserToken;

    it('sends a bearer-authorized GET and returns the response body', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(of({ data: { identificacion: '1850137918' } }));
      const httpService = { get } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      const result = await service.get('/personas/buscar/1850137918', token);

      expect(get).toHaveBeenCalledWith(
        'https://core-api.test/personas/buscar/1850137918',
        { headers: { Authorization: 'Bearer access-1' } },
      );
      expect(result).toEqual({ identificacion: '1850137918' });
    });

    it('maps a 404 to a TerminalCoreApiError carrying the status', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(404)));
      const httpService = { get } as unknown as HttpService;
      const service = new CoreApiHttpService(httpService, config);

      await expect(
        service.get('/personas/buscar/0000000000', token),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
