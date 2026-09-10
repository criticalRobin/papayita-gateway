import { UnauthorizedException } from '@nestjs/common';
import { TaxCatalogController } from './tax-catalog.controller';
import type { TaxCatalogClient } from './tax-catalog-client.interface';
import type { AuthService } from '../auth/auth.service';
import type { RequestWithWebviewSession } from '../webview-session/webview-session.guard';
import type { CoreApiUserToken } from '../core-api/core-api-token';

const TOKEN = 'token' as CoreApiUserToken;

function makeRequest(): RequestWithWebviewSession {
  return {
    webviewSession: { phoneNumber: '5219999999999', emisorId: 'emisor-1' },
  } as RequestWithWebviewSession;
}

describe('TaxCatalogController', () => {
  it('findAll() resolves the token and delegates to the client', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const client = { findAll } as unknown as TaxCatalogClient;
    const authService = {
      getValidToken: jest.fn().mockResolvedValue(TOKEN),
    } as unknown as AuthService;
    const controller = new TaxCatalogController(client, authService);

    await controller.findAll(makeRequest());

    expect(findAll).toHaveBeenCalledWith(TOKEN);
  });

  it('throws Unauthorized when the phone has no valid Core API token', async () => {
    const client = { findAll: jest.fn() } as unknown as TaxCatalogClient;
    const authService = {
      getValidToken: jest.fn().mockResolvedValue(null),
    } as unknown as AuthService;
    const controller = new TaxCatalogController(client, authService);

    await expect(controller.findAll(makeRequest())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
