import { ConfigService } from '@nestjs/config';
import { ConversationStateService } from './conversation-state.service';
import { createIdleRecord } from './domain/state-machine';

function makeRedis() {
  return {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
}

function makeConfig(ttl = 900) {
  return { get: jest.fn().mockReturnValue(ttl) } as unknown as ConfigService;
}

describe('ConversationStateService', () => {
  it('returns a default idle record when no key exists', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue(null);
    const service = new ConversationStateService(redis as never, makeConfig());

    const state = await service.getState('5219999999999');

    expect(state.state).toBe('idle');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('parses an existing record from Redis', async () => {
    const stored = { ...createIdleRecord(), state: 'awaiting_webview_action' };
    const redis = makeRedis();
    redis.get.mockResolvedValue(JSON.stringify(stored));
    const service = new ConversationStateService(redis as never, makeConfig());

    const state = await service.getState('5219999999999');

    expect(state.state).toBe('awaiting_webview_action');
  });

  it('fills billingContext: null for records stored before the field existed', async () => {
    const legacy = {
      state: 'awaiting_webview_action',
      pendingDocument: null,
      correlationId: 'corr-1',
      updatedAt: 'x',
    };
    const redis = makeRedis();
    redis.get.mockResolvedValue(JSON.stringify(legacy));
    const service = new ConversationStateService(redis as never, makeConfig());

    const state = await service.getState('5219999999999');

    expect(state.billingContext).toBeNull();
    expect(state.correlationId).toBe('corr-1');
  });

  it('uses BILLING_CONTEXT_TTL_SECONDS while the correction window is open', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue(null);
    const config = {
      get: jest.fn((key: string) =>
        key === 'BILLING_CONTEXT_TTL_SECONDS' ? 600 : 900,
      ),
    } as unknown as ConfigService;
    const service = new ConversationStateService(redis as never, config);

    await service.applyEvent('5219999999999', {
      type: 'BILLING_INCOMPLETE',
      context: {
        extracted: {
          comprador: { tipoIdentificacion: null, identificacion: null },
          items: [{ idCliente: 'item-1', textoConsulta: 'x', cantidad: 1 }],
        },
        issues: [{ kind: 'producto_no_encontrado', termino: 'x' }],
        messages: ['factura x'],
        attempts: 0,
      },
    });

    expect(redis.set).toHaveBeenCalledWith(
      'conversation:5219999999999',
      expect.any(String),
      'EX',
      600,
    );
  });

  it('applyEvent persists the transitioned record and refreshes the TTL', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue(null);
    const service = new ConversationStateService(
      redis as never,
      makeConfig(900),
    );

    const next = await service.applyEvent('5219999999999', {
      type: 'DRAFT_READY',
      correlationId: 'corr-1',
      draft: { total: 5 },
    });

    expect(next.state).toBe('awaiting_webview_action');
    expect(redis.set).toHaveBeenCalledWith(
      'conversation:5219999999999',
      expect.any(String),
      'EX',
      900,
    );
  });

  it('logs a state-transition line only when the state actually changes', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue(null); // idle
    const service = new ConversationStateService(redis as never, makeConfig());
    const logSpy = jest.spyOn(
      (service as unknown as { logger: { log: (msg: string) => void } }).logger,
      'log',
    );

    // WEBVIEW_CONFIRMED from idle is a no-op transition (stays idle) per state-machine.ts.
    await service.applyEvent('5219999999999', { type: 'WEBVIEW_CONFIRMED' });
    expect(logSpy).not.toHaveBeenCalled();

    await service.applyEvent('5219999999999', {
      type: 'DRAFT_READY',
      correlationId: 'corr-1',
      draft: {},
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('idle -> awaiting_webview_action'),
    );
  });

  describe('reset', () => {
    it('deletes the phone record', async () => {
      const redis = makeRedis();
      const service = new ConversationStateService(
        redis as never,
        makeConfig(),
      );

      await service.reset('5219999999999');

      expect(redis.del).toHaveBeenCalledWith('conversation:5219999999999');
    });

    it('leaves the phone back at idle afterward', async () => {
      const redis = makeRedis();
      const service = new ConversationStateService(
        redis as never,
        makeConfig(),
      );

      await service.reset('5219999999999');
      redis.get.mockResolvedValue(null);
      const state = await service.getState('5219999999999');

      expect(state.state).toBe('idle');
    });
  });
});
