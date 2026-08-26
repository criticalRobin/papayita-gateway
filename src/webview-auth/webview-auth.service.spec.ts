import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { WebviewAuthService } from './webview-auth.service';

function makeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    del: jest.fn((key: string) => {
      const existed = store.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
  } as unknown as Redis;
}

function makeConfig(): ConfigService {
  return { get: () => 900 } as unknown as ConfigService;
}

describe('WebviewAuthService', () => {
  it('mints a code that resolves back to the phone number once', async () => {
    const redis = makeRedis();
    const service = new WebviewAuthService(redis, makeConfig());

    const code = await service.mintLoginCode('5219999999999');
    const phoneNumber = await service.consumeLoginCode(code);

    expect(phoneNumber).toBe('5219999999999');
  });

  it('is single-use — a second consume of the same code returns null', async () => {
    const redis = makeRedis();
    const service = new WebviewAuthService(redis, makeConfig());

    const code = await service.mintLoginCode('5219999999999');
    await service.consumeLoginCode(code);
    const secondAttempt = await service.consumeLoginCode(code);

    expect(secondAttempt).toBeNull();
  });

  it('returns null for an unknown code', async () => {
    const redis = makeRedis();
    const service = new WebviewAuthService(redis, makeConfig());

    const result = await service.consumeLoginCode('does-not-exist');

    expect(result).toBeNull();
  });
});
