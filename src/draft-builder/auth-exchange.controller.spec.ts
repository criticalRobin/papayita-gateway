import { UnauthorizedException } from '@nestjs/common';
import { AuthExchangeController } from './auth-exchange.controller';
import type { WebviewAuthService } from '../webview-auth/webview-auth.service';
import type { DraftBuilderService } from './draft-builder.service';

describe('AuthExchangeController', () => {
  it('rejects an invalid or expired exchange code with 401', async () => {
    const consumeExchangeCode = jest.fn().mockResolvedValue(null);
    const getDraft = jest.fn();
    const controller = new AuthExchangeController(
      { consumeExchangeCode } as unknown as WebviewAuthService,
      { getDraft } as unknown as DraftBuilderService,
    );

    await expect(controller.exchange({ code: 'stale' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(getDraft).not.toHaveBeenCalled();
  });

  it('returns the session token and draft together in one call', async () => {
    const consumeExchangeCode = jest.fn().mockResolvedValue({
      phoneNumber: '+593993908744',
      correlationId: 'corr-1',
      sessionToken: 'wst_abc',
    });
    const draft = { correlationId: 'corr-1', items: [] };
    const getDraft = jest.fn().mockResolvedValue(draft);
    const controller = new AuthExchangeController(
      { consumeExchangeCode } as unknown as WebviewAuthService,
      { getDraft } as unknown as DraftBuilderService,
    );

    const result = await controller.exchange({ code: 'valid' });

    expect(getDraft).toHaveBeenCalledWith('+593993908744', 'corr-1');
    expect(result).toEqual({ sessionToken: 'wst_abc', draft });
  });
});
