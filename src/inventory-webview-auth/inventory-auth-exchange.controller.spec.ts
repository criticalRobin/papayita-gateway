import { UnauthorizedException } from '@nestjs/common';
import { InventoryAuthExchangeController } from './inventory-auth-exchange.controller';
import type { AuthService } from '../auth/auth.service';
import type { WebviewAuthService } from '../webview-auth/webview-auth.service';
import type { WebviewSessionService } from '../webview-session/webview-session.service';

describe('InventoryAuthExchangeController', () => {
  it('exchanges a valid code for a session token scoped to phone+emisorId', async () => {
    const consumeInventoryCode = jest.fn().mockResolvedValue('5219999999999');
    const getEmisorId = jest.fn().mockResolvedValue('emisor-1');
    const createSession = jest.fn().mockResolvedValue('session-token');
    const controller = new InventoryAuthExchangeController(
      { getEmisorId } as unknown as AuthService,
      { consumeInventoryCode } as unknown as WebviewAuthService,
      { createSession } as unknown as WebviewSessionService,
    );

    const result = await controller.exchange({ code: 'code-1' });

    expect(consumeInventoryCode).toHaveBeenCalledWith('code-1');
    expect(createSession).toHaveBeenCalledWith({
      phoneNumber: '5219999999999',
      emisorId: 'emisor-1',
    });
    expect(result).toEqual({ sessionToken: 'session-token' });
  });

  it('throws Unauthorized for an invalid/expired code', async () => {
    const consumeInventoryCode = jest.fn().mockResolvedValue(null);
    const controller = new InventoryAuthExchangeController(
      {} as unknown as AuthService,
      { consumeInventoryCode } as unknown as WebviewAuthService,
      {} as unknown as WebviewSessionService,
    );

    await expect(
      controller.exchange({ code: 'bad-code' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws Unauthorized if the phone is no longer authenticated', async () => {
    const consumeInventoryCode = jest.fn().mockResolvedValue('5219999999999');
    const getEmisorId = jest.fn().mockResolvedValue(null);
    const controller = new InventoryAuthExchangeController(
      { getEmisorId } as unknown as AuthService,
      { consumeInventoryCode } as unknown as WebviewAuthService,
      {} as unknown as WebviewSessionService,
    );

    await expect(
      controller.exchange({ code: 'code-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
