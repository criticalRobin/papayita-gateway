import {
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
  const state = { phoneNumber: '5219999999999', attemptsRemaining: 3 };

  it('rejects an invalid or expired code with 401', async () => {
    const peekLoginCode = jest.fn().mockResolvedValue(null);
    const login = jest.fn();
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { peekLoginCode } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(login).not.toHaveBeenCalled();
  });

  it('returns success, calls AuthService.login with the resolved phone number, and burns the code', async () => {
    const peekLoginCode = jest.fn().mockResolvedValue(state);
    const burnLoginCode = jest.fn().mockResolvedValue(undefined);
    const login = jest.fn().mockResolvedValue(undefined);
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { peekLoginCode, burnLoginCode } as unknown as WebviewAuthService,
    );

    const result = await controller.loginWebview(dto);

    expect(login).toHaveBeenCalledWith(
      '5219999999999',
      'user@empresa.com',
      'secret',
    );
    expect(burnLoginCode).toHaveBeenCalledWith('code-1');
    expect(result).toEqual({ success: true });
  });

  it('maps bad Core API credentials to a 400 with attemptsRemaining, without leaking the raw error', async () => {
    const peekLoginCode = jest.fn().mockResolvedValue(state);
    const registerLoginFailure = jest.fn().mockResolvedValue(2);
    const login = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('status 401 raw body here'));
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { peekLoginCode, registerLoginFailure } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toMatchObject({
      response: { message: 'Credenciales inválidas.', attemptsRemaining: 2 },
    });
    expect(registerLoginFailure).toHaveBeenCalledWith('code-1');
  });

  it('maps an unauthorized-WhatsApp-number Core API error to a tailored 400 message', async () => {
    const peekLoginCode = jest.fn().mockResolvedValue(state);
    const registerLoginFailure = jest.fn().mockResolvedValue(2);
    const login = jest
      .fn()
      .mockRejectedValue(
        new TerminalCoreApiError(
          'Core API call rejected (status 401) for login us***@empresa.com',
          401,
          'El número de WhatsApp +593987654321 no está autorizado para este emisor',
        ),
      );
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { peekLoginCode, registerLoginFailure } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toMatchObject({
      response: {
        message: 'Tu número de WhatsApp no está autorizado para este emisor.',
        attemptsRemaining: 2,
      },
    });
  });

  it('burns the code and returns 401 once the 3rd wrong attempt exhausts it', async () => {
    const peekLoginCode = jest.fn().mockResolvedValue(state);
    const registerLoginFailure = jest.fn().mockResolvedValue(0);
    const login = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('status 401 raw body here'));
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { peekLoginCode, registerLoginFailure } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toMatchObject({
      response: { message: 'Credenciales inválidas.', attemptsRemaining: 0 },
    });
  });

  it('treats a code that vanished mid-attempt (race/expiry) as invalid, not a counted failure', async () => {
    const peekLoginCode = jest.fn().mockResolvedValue(state);
    const registerLoginFailure = jest.fn().mockResolvedValue(null);
    const login = jest
      .fn()
      .mockRejectedValue(new TerminalCoreApiError('status 401 raw body here'));
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { peekLoginCode, registerLoginFailure } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('maps a retryable Core API failure to a 503 without touching attemptsRemaining', async () => {
    const peekLoginCode = jest.fn().mockResolvedValue(state);
    const registerLoginFailure = jest.fn();
    const login = jest
      .fn()
      .mockRejectedValue(new RetryableCoreApiError('network blip'));
    const controller = new AuthController(
      { login } as unknown as AuthService,
      { peekLoginCode, registerLoginFailure } as unknown as WebviewAuthService,
    );

    await expect(controller.loginWebview(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(registerLoginFailure).not.toHaveBeenCalled();
  });
});
