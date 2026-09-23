import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { maskTail } from '../common/redact';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type {
  CoreApiClient,
  CoreApiTokenSet,
} from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { TerminalCoreApiError } from '../core-api/core-api.errors';
import { WebviewAuthService } from '../webview-auth/webview-auth.service';

export const AUTH_REDIS_CLIENT = 'AUTH_REDIS_CLIENT';

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  emisorId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
    @Inject(AUTH_REDIS_CLIENT) private readonly redis: Redis,
    private readonly webviewAuthService: WebviewAuthService,
  ) {}

  // Returns null when the phone isn't authenticated, or when its refresh
  // token has also expired — both cases mean the caller should prompt
  // "iniciar sesión" again. A retryable Core API failure during refresh is
  // NOT swallowed here — it propagates so the caller can retry the whole
  // job instead of silently treating a network blip as a forced logout.
  async getValidToken(phoneNumber: string): Promise<CoreApiUserToken | null> {
    const raw = await this.redis.get(this.key(phoneNumber));
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedToken;
    if (new Date(cached.expiresAt) > new Date(Date.now() + 60_000)) {
      return cached.accessToken as CoreApiUserToken;
    }

    try {
      const refreshed = await this.coreApiClient.refresh(cached.refreshToken);
      await this.cache(phoneNumber, refreshed);
      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof TerminalCoreApiError) {
        this.logger.warn(
          `refresh token invalid for phone=${maskTail(phoneNumber)}, clearing — re-login required`,
        );
        await this.clearSession(phoneNumber);
        return null;
      }
      throw error;
    }
  }

  async login(
    phoneNumber: string,
    email: string,
    password: string,
  ): Promise<void> {
    const token = await this.coreApiClient.login(email, password, phoneNumber);
    // A fresh login never inherits an "administrar productos" link minted
    // during a previous session.
    await this.webviewAuthService.killInventoryCodeForPhone(phoneNumber);
    await this.cache(phoneNumber, token);
    this.logger.log(`phone=${maskTail(phoneNumber)} authenticated`);
  }

  // "cerrar sesión": local, idempotent cleanup only — never calls the Core
  // API. del() on a nonexistent key resolves without error, so this is safe
  // to call whether or not the phone was ever authenticated.
  async logout(phoneNumber: string): Promise<void> {
    await this.clearSession(phoneNumber);
    this.logger.log(`phone=${maskTail(phoneNumber)} logged out`);
  }

  // Static per account (doesn't change on refresh) — read straight from the
  // cached record, no expiry/refresh dance needed. Returns null only if the
  // phone was never logged in.
  async getEmisorId(phoneNumber: string): Promise<string | null> {
    const raw = await this.redis.get(this.key(phoneNumber));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedToken;
    return cached.emisorId;
  }

  // The inventory CTA code has no TTL of its own — its lifetime is this auth
  // session, so it dies whenever the auth record does.
  private async clearSession(phoneNumber: string): Promise<void> {
    await Promise.all([
      this.redis.del(this.key(phoneNumber)),
      this.webviewAuthService.killInventoryCodeForPhone(phoneNumber),
    ]);
  }

  private async cache(
    phoneNumber: string,
    token: CoreApiTokenSet,
  ): Promise<void> {
    const record: CachedToken = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt.toISOString(),
      emisorId: token.emisorId,
    };
    // No Redis TTL — lifetime is managed by refresh/clear above, not expiry.
    await this.redis.set(this.key(phoneNumber), JSON.stringify(record));
  }

  private key(phoneNumber: string): string {
    return `auth:${phoneNumber}`;
  }
}
