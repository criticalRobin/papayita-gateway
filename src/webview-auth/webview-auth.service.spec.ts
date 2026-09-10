import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { WebviewAuthService } from './webview-auth.service';
import type { WebviewSessionService } from '../webview-session/webview-session.service';

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

function makeWebviewSessionService(
  createSession = jest.fn().mockResolvedValue('session-token'),
): WebviewSessionService {
  return { createSession } as unknown as WebviewSessionService;
}

describe('WebviewAuthService', () => {
  describe('login codes', () => {
    it('mints a code that resolves back to the phone number once', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintLoginCode('5219999999999');
      const phoneNumber = await service.consumeLoginCode(code);

      expect(phoneNumber).toBe('5219999999999');
    });

    it('is single-use — a second consume of the same code returns null', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintLoginCode('5219999999999');
      await service.consumeLoginCode(code);
      const secondAttempt = await service.consumeLoginCode(code);

      expect(secondAttempt).toBeNull();
    });

    it('returns null for an unknown code', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const result = await service.consumeLoginCode('does-not-exist');

      expect(result).toBeNull();
    });
  });

  describe('exchange codes', () => {
    it('mints a code that resolves to a session token and payload once', async () => {
      const redis = makeRedis();
      const createSession = jest.fn().mockResolvedValue('session-token');
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(createSession),
      );

      const code = await service.mintExchangeCode('+593993908744', 'corr-1');
      const result = await service.consumeExchangeCode(code);

      expect(createSession).toHaveBeenCalledWith({
        phoneNumber: '+593993908744',
        correlationId: 'corr-1',
      });
      expect(result).toEqual({
        phoneNumber: '+593993908744',
        correlationId: 'corr-1',
        sessionToken: 'session-token',
      });
    });

    it('is single-use — a second consume of the same exchange code returns null', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintExchangeCode('+593993908744', 'corr-1');
      await service.consumeExchangeCode(code);
      const secondAttempt = await service.consumeExchangeCode(code);

      expect(secondAttempt).toBeNull();
    });

    it('returns null for an unknown exchange code', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const result = await service.consumeExchangeCode('does-not-exist');

      expect(result).toBeNull();
    });
  });

  describe('inventory codes', () => {
    it('mints a code that resolves back to the phone number once', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintInventoryCode('5219999999999');
      const phoneNumber = await service.consumeInventoryCode(code);

      expect(phoneNumber).toBe('5219999999999');
    });

    it('is single-use — a second consume of the same code returns null', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintInventoryCode('5219999999999');
      await service.consumeInventoryCode(code);
      const secondAttempt = await service.consumeInventoryCode(code);

      expect(secondAttempt).toBeNull();
    });

    it('returns null for an unknown code', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const result = await service.consumeInventoryCode('does-not-exist');

      expect(result).toBeNull();
    });
  });
});
