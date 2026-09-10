import { UnauthorizedException } from '@nestjs/common';
import { InventoryProductController } from './inventory-product.controller';
import type { InventoryProductClient } from './inventory-product-client.interface';
import type { AuthService } from '../auth/auth.service';
import type { RequestWithWebviewSession } from '../webview-session/webview-session.guard';
import type { CoreApiUserToken } from '../core-api/core-api-token';

const TOKEN = 'token' as CoreApiUserToken;

function makeRequest(): RequestWithWebviewSession {
  return {
    webviewSession: { phoneNumber: '5219999999999', emisorId: 'emisor-1' },
  } as RequestWithWebviewSession;
}

function makeAuthService(
  getValidToken = jest.fn().mockResolvedValue(TOKEN),
): AuthService {
  return { getValidToken } as unknown as AuthService;
}

describe('InventoryProductController', () => {
  it('findAll() resolves the token and delegates with the session emisorId', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const client = { findAll } as unknown as InventoryProductClient;
    const controller = new InventoryProductController(client, makeAuthService());

    await controller.findAll(makeRequest());

    expect(findAll).toHaveBeenCalledWith(TOKEN, 'emisor-1');
  });

  it('create() forwards the dto with the session emisorId', async () => {
    const create = jest.fn().mockResolvedValue({});
    const client = { create } as unknown as InventoryProductClient;
    const controller = new InventoryProductController(client, makeAuthService());
    const dto = { nombre: 'Producto' } as any;

    await controller.create(makeRequest(), dto);

    expect(create).toHaveBeenCalledWith(TOKEN, 'emisor-1', dto);
  });

  it('throws Unauthorized when the phone has no valid Core API token', async () => {
    const client = { findAll: jest.fn() } as unknown as InventoryProductClient;
    const controller = new InventoryProductController(
      client,
      makeAuthService(jest.fn().mockResolvedValue(null)),
    );

    await expect(controller.findAll(makeRequest())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
