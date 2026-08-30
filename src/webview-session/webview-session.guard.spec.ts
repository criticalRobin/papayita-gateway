import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { WebviewSessionGuard } from './webview-session.guard';
import { WebviewSessionService } from './webview-session.service';

function makeContext(authorization?: string): ExecutionContext {
  const request: Record<string, unknown> = { headers: { authorization } };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('WebviewSessionGuard', () => {
  it('allows the request and attaches the session when the token is valid', async () => {
    const validateSession = jest.fn().mockResolvedValue({
      phoneNumber: '+593993908744',
      correlationId: 'corr-1',
    });
    const guard = new WebviewSessionGuard({
      validateSession,
    } as unknown as WebviewSessionService);
    const context = makeContext('Bearer valid-token');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(validateSession).toHaveBeenCalledWith('valid-token');
  });

  it('throws UnauthorizedException when no Authorization header is present', async () => {
    const guard = new WebviewSessionGuard(
      {} as unknown as WebviewSessionService,
    );
    const context = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the token is invalid/expired', async () => {
    const validateSession = jest.fn().mockResolvedValue(null);
    const guard = new WebviewSessionGuard({
      validateSession,
    } as unknown as WebviewSessionService);
    const context = makeContext('Bearer stale-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
