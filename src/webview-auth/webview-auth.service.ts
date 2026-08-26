import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { maskTail } from '../common/redact';

export const WEBVIEW_AUTH_REDIS_CLIENT = 'WEBVIEW_AUTH_REDIS_CLIENT';

@Injectable()
export class WebviewAuthService {
  private readonly logger = new Logger(WebviewAuthService.name);

  constructor(
    @Inject(WEBVIEW_AUTH_REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  // Login CTA only, for now — draft/registration exchange codes belong to
  // webview-auth once draft-builder exists, not built here (out of scope).
  async mintLoginCode(phoneNumber: string): Promise<string> {
    const code = randomUUID();
    const ttl = this.config.get<number>('LOGIN_CODE_TTL_SECONDS', 900);
    await this.redis.set(this.key(code), phoneNumber, 'EX', ttl);
    return code;
  }

  // Single-use: the code is deleted as soon as it's read, so a replayed or
  // expired code always returns null.
  async consumeLoginCode(code: string): Promise<string | null> {
    const phoneNumber = await this.redis.get(this.key(code));
    if (!phoneNumber) return null;
    await this.redis.del(this.key(code));
    this.logger.log(`login code consumed for phone=${maskTail(phoneNumber)}`);
    return phoneNumber;
  }

  private key(code: string): string {
    return `webview-login:${code}`;
  }
}
