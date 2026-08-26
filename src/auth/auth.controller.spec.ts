import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { WebviewAuthService } from '../webview-auth/webview-auth.service';
import {
  RetryableCoreApiError,
  TerminalCoreApiError,
} from '../core-api/core-api.errors';

describe('AuthController', () => {
  const dto = { code: 'code-1', email: 'user@empresa.com', password: 'secret' };

  it('rejects an invalid or expired code with 401', async () => {
    const consumeLoginCode = jest.fn().mockResolvedValue(null);
    const login = jest.fn();
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { consumeLoginCode } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(login).not.toHaveBeenCalled();
  });

  it('returns success and calls AuthService.login with the resolved phone number', async () => {
    const consumeLoginCode = jest.fn().mockResolvedValue('5219999999999');
    const login = jest.fn().mockResolvedValue(undefined);
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { consumeLoginCode } as unknown as WebviewAuthService,
    );

    const result = await controller.loginWebview(dto);

    expect(login).toHaveBeenCalledWith(
      '5219999999999',
      'user@empresa.com',
      'secret',
    );
    expect(result).toEqual({ success: true });
  });

  it('maps bad Core API credentials to a 400 without leaking the raw error', async () => {
    const consumeLoginCode = jest.fn().mockResolvedValue('5219999999999');
    const login = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('status 401 raw body here'));
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { consumeLoginCode } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('maps a retryable Core API failure to a 503', async () => {
    const consumeLoginCode = jest.fn().mockResolvedValue('5219999999999');
    const login = jest
      .fn()
      .mockRejectedValue(new RetryableCoreApiError('network blip'));
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { consumeLoginCode } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
