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
  return {
    get: jest.fn((_key: string, def?: number) => def),
  } as unknown as ConfigService;
}

function makeWebviewSessionService(
  createSession = jest.fn().mockResolvedValue('session-token'),
): WebviewSessionService {
  return { createSession } as unknown as WebviewSessionService;
}

describe('WebviewAuthService', () => {
  describe('login codes', () => {
    it('mints a code that resolves to the phone number and default attempt count', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintLoginCode('5219999999999');
      const state = await service.peekLoginCode(code);

      expect(state).toEqual({
        phoneNumber: '5219999999999',
        attemptsRemaining: 3,
      });
    });

    it('peeking does not mutate attemptsRemaining or burn the code', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintLoginCode('5219999999999');
      await service.peekLoginCode(code);
      const second = await service.peekLoginCode(code);

      expect(second).toEqual({
        phoneNumber: '5219999999999',
        attemptsRemaining: 3,
      });
    });

    it('returns null from peekLoginCode for an unknown code', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const result = await service.peekLoginCode('does-not-exist');

      expect(result).toBeNull();
    });

    it('burnLoginCode deletes the code outright', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintLoginCode('5219999999999');
      await service.burnLoginCode(code);

      expect(await service.peekLoginCode(code)).toBeNull();
    });

    it('registerLoginFailure decrements attemptsRemaining and keeps the code alive', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintLoginCode('5219999999999');
      const attemptsRemaining = await service.registerLoginFailure(code);

      expect(attemptsRemaining).toBe(2);
      expect(await service.peekLoginCode(code)).toEqual({
        phoneNumber: '5219999999999',
        attemptsRemaining: 2,
      });
    });

    it('registerLoginFailure burns the code on the 3rd failure', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintLoginCode('5219999999999');
      await service.registerLoginFailure(code);
      await service.registerLoginFailure(code);
      const third = await service.registerLoginFailure(code);

      expect(third).toBe(0);
      expect(await service.peekLoginCode(code)).toBeNull();
    });

    it('registerLoginFailure returns null for an unknown/expired code', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const result = await service.registerLoginFailure('does-not-exist');

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

    it('is reusable up to the configured attempt limit, then dies', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintExchangeCode('+593993908744', 'corr-1');
      const first = await service.consumeExchangeCode(code);
      const second = await service.consumeExchangeCode(code);
      const third = await service.consumeExchangeCode(code);
      const fourth = await service.consumeExchangeCode(code);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(third).not.toBeNull();
      expect(fourth).toBeNull();
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

    it('killExchangeCodeForCorrelation burns the code immediately, even with attempts left', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintExchangeCode('+593993908744', 'corr-1');
      await service.killExchangeCodeForCorrelation('corr-1');
      const result = await service.consumeExchangeCode(code);

      expect(result).toBeNull();
    });

    it('killExchangeCodeForCorrelation is a no-op for an unknown correlationId', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      await expect(
        service.killExchangeCodeForCorrelation('does-not-exist'),
      ).resolves.toBeUndefined();
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
      const phoneNumber = await service.resolveInventoryCode(code);

      expect(phoneNumber).toBe('5219999999999');
    });

    it('is reusable — resolving the same code repeatedly keeps working', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintInventoryCode('5219999999999');
      await service.resolveInventoryCode(code);
      const secondAttempt = await service.resolveInventoryCode(code);

      expect(secondAttempt).toBe('5219999999999');
    });

    it('stores the code with no TTL — lifetime is tied to the auth session', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintInventoryCode('5219999999999');
      const { set } = redis as unknown as { set: jest.Mock };

      expect(set).toHaveBeenCalledWith(
        `webview-inventory:${code}`,
        '5219999999999',
      );
    });

    it('minting a new code invalidates the previous one for the same phone', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const oldCode = await service.mintInventoryCode('5219999999999');
      const newCode = await service.mintInventoryCode('5219999999999');

      expect(await service.resolveInventoryCode(oldCode)).toBeNull();
      expect(await service.resolveInventoryCode(newCode)).toBe('5219999999999');
    });

    it('killInventoryCodeForPhone burns the live code and is idempotent', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const code = await service.mintInventoryCode('5219999999999');
      await service.killInventoryCodeForPhone('5219999999999');

      expect(await service.resolveInventoryCode(code)).toBeNull();
      await expect(
        service.killInventoryCodeForPhone('5219999999999'),
      ).resolves.toBeUndefined();
    });

    it('returns null for an unknown code', async () => {
      const redis = makeRedis();
      const service = new WebviewAuthService(
        redis,
        makeConfig(),
        makeWebviewSessionService(),
      );

      const result = await service.resolveInventoryCode('does-not-exist');

      expect(result).toBeNull();
    });
  });
});
