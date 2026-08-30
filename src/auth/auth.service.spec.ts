import type { Redis } from 'ioredis';
import { AuthService } from './auth.service';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import {
  RetryableCoreApiError,
  TerminalCoreApiError,
} from '../core-api/core-api.errors';

function makeRedis(store: Map<string, string>): Redis {
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      const existed = store.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
  } as unknown as Redis;
}

interface CachedTokenShape {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  emisorId: string;
}

describe('AuthService', () => {
  const phoneNumber = '5219999999999';

  it('returns null when the phone has never logged in', async () => {
    const store = new Map<string, string>();
    const redis = makeRedis(store);
    const coreApiClient = {} as unknown as CoreApiClient;
    const service = new AuthService(coreApiClient, redis);

    const token = await service.getValidToken(phoneNumber);

    expect(token).toBeNull();
  });

  it('returns the cached token as-is when still valid', async () => {
    const store = new Map<string, string>([
      [
        `auth:${phoneNumber}`,
        JSON.stringify({
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          emisorId: 'emisor-1',
        }),
      ],
    ]);
    const redis = makeRedis(store);
    const refresh = jest.fn();
    const coreApiClient = { refresh } as unknown as CoreApiClient;
    const service = new AuthService(coreApiClient, redis);

    const token = await service.getValidToken(phoneNumber);

    expect(token).toBe('access-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes and re-caches when the access token is near expiry', async () => {
    const store = new Map<string, string>([
      [
        `auth:${phoneNumber}`,
        JSON.stringify({
          accessToken: 'access-old',
          refreshToken: 'refresh-1',
          expiresAt: new Date(Date.now() + 1_000).toISOString(),
          emisorId: 'emisor-1',
        }),
      ],
    ]);
    const redis = makeRedis(store);
    const refresh = jest.fn().mockResolvedValue({
      accessToken: 'access-new' as CoreApiUserToken,
      refreshToken: 'refresh-2',
      expiresAt: new Date(Date.now() + 3_600_000),
      emisorId: 'emisor-1',
    });
    const coreApiClient = { refresh } as unknown as CoreApiClient;
    const service = new AuthService(coreApiClient, redis);

    const token = await service.getValidToken(phoneNumber);

    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(token).toBe('access-new');
    expect(
      (JSON.parse(store.get(`auth:${phoneNumber}`)!) as CachedTokenShape)
        .accessToken,
    ).toBe('access-new');
  });

  it('clears the cache and returns null when the refresh token is also invalid', async () => {
    const store = new Map<string, string>([
      [
        `auth:${phoneNumber}`,
        JSON.stringify({
          accessToken: 'access-old',
          refreshToken: 'refresh-expired',
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
          emisorId: 'emisor-1',
        }),
      ],
    ]);
    const redis = makeRedis(store);
    const refresh = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('refresh token invalid'));
    const coreApiClient = { refresh } as unknown as CoreApiClient;
    const service = new AuthService(coreApiClient, redis);

    const token = await service.getValidToken(phoneNumber);

    expect(token).toBeNull();
    expect(store.has(`auth:${phoneNumber}`)).toBe(false);
  });

  it('propagates a retryable refresh failure instead of forcing a logout', async () => {
    const store = new Map<string, string>([
      [
        `auth:${phoneNumber}`,
        JSON.stringify({
          accessToken: 'access-old',
          refreshToken: 'refresh-1',
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
          emisorId: 'emisor-1',
        }),
      ],
    ]);
    const redis = makeRedis(store);
    const refresh = jest
      .fn()
      .mockRejectedValue(new RetryableCoreApiError('network blip'));
    const coreApiClient = { refresh } as unknown as CoreApiClient;
    const service = new AuthService(coreApiClient, redis);

    await expect(service.getValidToken(phoneNumber)).rejects.toThrow(
      RetryableCoreApiError,
    );
    expect(store.has(`auth:${phoneNumber}`)).toBe(true); // not cleared on a retryable failure
  });

  it('logs in via the Core API and caches the resulting token', async () => {
    const store = new Map<string, string>();
    const redis = makeRedis(store);
    const login = jest.fn().mockResolvedValue({
      accessToken: 'access-1' as CoreApiUserToken,
      refreshToken: 'refresh-1',
      expiresAt: new Date(Date.now() + 3_600_000),
      emisorId: 'emisor-1',
    });
    const coreApiClient = { login } as unknown as CoreApiClient;
    const service = new AuthService(coreApiClient, redis);

    await service.login(phoneNumber, 'user@empresa.com', 'secret');

    expect(login).toHaveBeenCalledWith('user@empresa.com', 'secret');
    expect(
      (JSON.parse(store.get(`auth:${phoneNumber}`)!) as CachedTokenShape)
        .accessToken,
    ).toBe('access-1');
    expect(
      (JSON.parse(store.get(`auth:${phoneNumber}`)!) as CachedTokenShape)
        .emisorId,
    ).toBe('emisor-1');
  });

  describe('getEmisorId', () => {
    it('returns null when the phone has never logged in', async () => {
      const store = new Map<string, string>();
      const redis = makeRedis(store);
      const service = new AuthService({} as unknown as CoreApiClient, redis);

      expect(await service.getEmisorId(phoneNumber)).toBeNull();
    });

    it('returns the cached emisorId without triggering a refresh', async () => {
      const store = new Map<string, string>([
        [
          `auth:${phoneNumber}`,
          JSON.stringify({
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
            expiresAt: new Date(Date.now() - 1_000).toISOString(), // expired, irrelevant here
            emisorId: 'emisor-1',
          }),
        ],
      ]);
      const redis = makeRedis(store);
      const refresh = jest.fn();
      const service = new AuthService(
        { refresh } as unknown as CoreApiClient,
        redis,
      );

      expect(await service.getEmisorId(phoneNumber)).toBe('emisor-1');
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
