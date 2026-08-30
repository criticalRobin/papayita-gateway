import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  WebviewSessionPayload,
  WebviewSessionService,
} from './webview-session.service';
import { WebviewSessionToken } from './webview-session-token';

export interface RequestWithWebviewSession extends Request {
  webviewSession: WebviewSessionPayload;
}

@Injectable()
export class WebviewSessionGuard implements CanActivate {
  constructor(private readonly webviewSessionService: WebviewSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithWebviewSession>();
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Falta el token de sesión.');
    }

    const session = await this.webviewSessionService.validateSession(
      token as WebviewSessionToken,
    );
    if (!session) {
      throw new UnauthorizedException(
        'Tu sesión ya no es válida, pídele a tu negocio que envíe la factura de nuevo.',
      );
    }

    request.webviewSession = session;
    return true;
  }
}
