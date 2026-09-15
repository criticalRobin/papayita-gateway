import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthExchangeController } from './auth-exchange.controller';
import type { WebviewAuthService } from '../webview-auth/webview-auth.service';
import type { ConversationStateService } from '../conversation-state/conversation-state.service';

describe('AuthExchangeController', () => {
  it('rejects an invalid or expired exchange code with 401', async () => {
    const consumeExchangeCode = jest.fn().mockResolvedValue(null);
    const getPendingDocument = jest.fn();
    const controller = new AuthExchangeController(
      { consumeExchangeCode } as unknown as WebviewAuthService,
      { getPendingDocument } as unknown as ConversationStateService,
    );

    await expect(controller.exchange({ code: 'stale' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(getPendingDocument).not.toHaveBeenCalled();
  });

  it('returns 404 when the exchanged correlationId has no pending document', async () => {
    const consumeExchangeCode = jest.fn().mockResolvedValue({
      phoneNumber: '+593993908744',
      correlationId: 'corr-1',
      sessionToken: 'wst_abc',
    });
    const getPendingDocument = jest.fn().mockResolvedValue(null);
    const controller = new AuthExchangeController(
      { consumeExchangeCode } as unknown as WebviewAuthService,
      { getPendingDocument } as unknown as ConversationStateService,
    );

    await expect(controller.exchange({ code: 'valid' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the session token and draft together in one call', async () => {
    const consumeExchangeCode = jest.fn().mockResolvedValue({
      phoneNumber: '+593993908744',
      correlationId: 'corr-1',
      sessionToken: 'wst_abc',
    });
    const draft = { correlationId: 'corr-1', items: [] };
    const getPendingDocument = jest.fn().mockResolvedValue(draft);
    const controller = new AuthExchangeController(
      { consumeExchangeCode } as unknown as WebviewAuthService,
      { getPendingDocument } as unknown as ConversationStateService,
    );

    const result = await controller.exchange({ code: 'valid' });

    expect(getPendingDocument).toHaveBeenCalledWith('+593993908744', 'corr-1');
    expect(result).toEqual({ sessionToken: 'wst_abc', draft });
  });

  it('returns a credit-note candidate document as-is, discriminated by kind', async () => {
    const consumeExchangeCode = jest.fn().mockResolvedValue({
      phoneNumber: '+593993908744',
      correlationId: 'corr-2',
      sessionToken: 'wst_def',
    });
    const draft = {
      kind: 'credit_note_candidates',
      identificacionComprador: '1802258721',
      candidatos: [],
    };
    const getPendingDocument = jest.fn().mockResolvedValue(draft);
    const controller = new AuthExchangeController(
      { consumeExchangeCode } as unknown as WebviewAuthService,
      { getPendingDocument } as unknown as ConversationStateService,
    );

    const result = await controller.exchange({ code: 'valid' });

    expect(result).toEqual({ sessionToken: 'wst_def', draft });
  });
});
