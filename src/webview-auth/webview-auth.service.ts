import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { maskTail } from '../common/redact';
import { WebviewSessionService } from '../webview-session/webview-session.service';
import { WebviewSessionToken } from '../webview-session/webview-session-token';

export const WEBVIEW_AUTH_REDIS_CLIENT = 'WEBVIEW_AUTH_REDIS_CLIENT';

interface ExchangeCodePayload {
  phoneNumber: string;
  correlationId: string;
}

export interface ConsumedExchangeCode {
  phoneNumber: string;
  correlationId: string;
  sessionToken: WebviewSessionToken;
}

@Injectable()
export class WebviewAuthService {
  private readonly logger = new Logger(WebviewAuthService.name);

  constructor(
    @Inject(WEBVIEW_AUTH_REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly webviewSessionService: WebviewSessionService,
  ) {}

  async mintLoginCode(phoneNumber: string): Promise<string> {
    const code = randomUUID();
    const ttl = this.config.get<number>('LOGIN_CODE_TTL_SECONDS', 900);
    await this.redis.set(this.loginKey(code), phoneNumber, 'EX', ttl);
    return code;
  }

  // Single-use: the code is deleted as soon as it's read, so a replayed or
  // expired code always returns null.
  async consumeLoginCode(code: string): Promise<string | null> {
    const phoneNumber = await this.redis.get(this.loginKey(code));
    if (!phoneNumber) return null;
    await this.redis.del(this.loginKey(code));
    this.logger.log(`login code consumed for phone=${maskTail(phoneNumber)}`);
    return phoneNumber;
  }

  async peekPhoneForCode(code: string): Promise<string | null> {
    return this.redis.get(this.loginKey(code));
  }

  // "administrar productos" CTA: scoped to one phone, single-use, same shape
  // as the login code. Deliberately does not look up emisorId or mint a
  // session here — that needs AuthService, and this module is already
  // imported by AuthModule, so injecting AuthService here would close a
  // circular dependency. That lookup happens in
  // inventory-webview-auth/inventory-auth-exchange.controller.ts instead,
  // same reasoning as auth-exchange.controller.ts.
  async mintInventoryCode(phoneNumber: string): Promise<string> {
    const code = randomUUID();
    const ttl = this.config.get<number>('LOGIN_CODE_TTL_SECONDS', 900);
    await this.redis.set(this.inventoryKey(code), phoneNumber, 'EX', ttl);
    return code;
  }

  async consumeInventoryCode(code: string): Promise<string | null> {
    const phoneNumber = await this.redis.get(this.inventoryKey(code));
    if (!phoneNumber) return null;
    await this.redis.del(this.inventoryKey(code));
    this.logger.log(
      `inventory code consumed for phone=${maskTail(phoneNumber)}`,
    );
    return phoneNumber;
  }

  // Draft-confirmation CTA: scoped to one phone + correlationId, single-use,
  // same TTL as the conversation-state record it points to.
  async mintExchangeCode(
    phoneNumber: string,
    correlationId: string,
  ): Promise<string> {
    const code = randomUUID();
    const ttl = this.config.get<number>('CONVERSATION_STATE_TTL_SECONDS', 900);
    const payload: ExchangeCodePayload = { phoneNumber, correlationId };
    await this.redis.set(
      this.exchangeKey(code),
      JSON.stringify(payload),
      'EX',
      ttl,
    );
    return code;
  }

  // Single-use — deleted on read. On success, mints the webview session token
  // the caller will hand back to the webview alongside the draft.
  async consumeExchangeCode(
    code: string,
  ): Promise<ConsumedExchangeCode | null> {
    const raw = await this.redis.get(this.exchangeKey(code));
    if (!raw) return null;
    await this.redis.del(this.exchangeKey(code));

    const { phoneNumber, correlationId } = JSON.parse(
      raw,
    ) as ExchangeCodePayload;
    const sessionToken = await this.webviewSessionService.createSession({
      phoneNumber,
      correlationId,
    });
    this.logger.log(
      `exchange code consumed for phone=${maskTail(phoneNumber)}, correlationId=${correlationId}`,
    );
    return { phoneNumber, correlationId, sessionToken };
  }

  private loginKey(code: string): string {
    return `webview-login:${code}`;
  }

  private inventoryKey(code: string): string {
    return `webview-inventory:${code}`;
  }

  private exchangeKey(code: string): string {
    return `webview-exchange:${code}`;
  }
}
