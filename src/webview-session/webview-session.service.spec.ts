import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { WebviewSessionService } from './webview-session.service';
import { WebviewSessionToken } from './webview-session-token';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  };
}

function makeConfig(ttl = 900): ConfigService {
  return { get: () => ttl } as unknown as ConfigService;
}

describe('WebviewSessionService', () => {
  it('creates a session that validates back to its payload', async () => {
    const redis = makeRedis();
    const service = new WebviewSessionService(
      redis as unknown as Redis,
      makeConfig(),
    );

    const token = await service.createSession({
      phoneNumber: '+593993908744',
      correlationId: 'corr-1',
    });
    const session = await service.validateSession(token);

    expect(session).toEqual({
      phoneNumber: '+593993908744',
      correlationId: 'corr-1',
    });
  });

  it('is not single-use — validating twice still succeeds', async () => {
    const redis = makeRedis();
    const service = new WebviewSessionService(
      redis as unknown as Redis,
      makeConfig(),
    );

    const token = await service.createSession({
      phoneNumber: '+593993908744',
      correlationId: 'corr-1',
    });
    await service.validateSession(token);
    const second = await service.validateSession(token);

    expect(second).not.toBeNull();
  });

  it('returns null for an unknown token', async () => {
    const redis = makeRedis();
    const service = new WebviewSessionService(
      redis as unknown as Redis,
      makeConfig(),
    );

    const result = await service.validateSession(
      'does-not-exist' as WebviewSessionToken,
    );

    expect(result).toBeNull();
  });
});
