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
  attemptsRemaining: number;
}

interface LoginCodePayload {
  phoneNumber: string;
  attemptsRemaining: number;
}

export interface LoginCodeState {
  phoneNumber: string;
  attemptsRemaining: number;
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
    const maxAttempts = this.config.get<number>('LOGIN_CODE_MAX_ATTEMPTS', 3);
    const payload: LoginCodePayload = {
      phoneNumber,
      attemptsRemaining: maxAttempts,
    };
    await this.redis.set(
      this.loginKey(code),
      JSON.stringify(payload),
      'EX',
      ttl,
    );
    return code;
  }

  // Read-only — does not burn the code or touch attemptsRemaining. Used both
  // to resolve the phone number before attempting login and to serve
  // GET /login-webview/phone (so a page reload mid-flow still shows the
  // right attempt count without the front needing its own storage).
  async peekLoginCode(code: string): Promise<LoginCodeState | null> {
    const raw = await this.redis.get(this.loginKey(code));
    if (!raw) return null;
    return JSON.parse(raw) as LoginCodePayload;
  }

  // Burns the code outright — called once login actually succeeds, so the
  // code can't be replayed.
  async burnLoginCode(code: string): Promise<void> {
    await this.redis.del(this.loginKey(code));
  }

  // Records a wrong-credentials attempt: decrements attemptsRemaining and
  // burns the code once it hits 0 (a network blip on the Core API side
  // should NOT call this — only bad credentials/wpp-not-authorized count).
  // Returns the remaining count, or null if the code was already gone
  // (expired/replayed) so the caller can fall back to "request a new link".
  async registerLoginFailure(code: string): Promise<number | null> {
    const raw = await this.redis.get(this.loginKey(code));
    if (!raw) return null;

    const payload = JSON.parse(raw) as LoginCodePayload;
    payload.attemptsRemaining -= 1;
    if (payload.attemptsRemaining <= 0) {
      await this.redis.del(this.loginKey(code));
    } else {
      // KEEPTTL: don't reset the countdown on every retry — still bounded by
      // the original code TTL.
      await this.redis.set(
        this.loginKey(code),
        JSON.stringify(payload),
        'KEEPTTL',
      );
    }
    this.logger.log(
      `login attempt failed for phone=${maskTail(payload.phoneNumber)}, attemptsRemaining=${payload.attemptsRemaining}`,
    );
    return payload.attemptsRemaining;
  }

  // "administrar productos" CTA: scoped to one phone, reusable, and alive for
  // as long as the phone's WhatsApp auth session — no Redis TTL, same as the
  // auth record itself. Closing the webview and reopening the CTA must not
  // dead-end the link. Only the latest code per phone is valid: minting a new
  // one burns the previous one, and AuthService kills it on
  // login/logout/refresh failure via killInventoryCodeForPhone.
  //
  // Deliberately does not look up emisorId or mint a session here — that
  // needs AuthService, and this module is already imported by AuthModule, so
  // injecting AuthService here would close a circular dependency. That lookup
  // happens in inventory-webview-auth/inventory-auth-exchange.controller.ts
  // instead, same reasoning as auth-exchange.controller.ts.
  async mintInventoryCode(phoneNumber: string): Promise<string> {
    await this.killInventoryCodeForPhone(phoneNumber);
    const code = randomUUID();
    await this.redis.set(this.inventoryKey(code), phoneNumber);
    await this.redis.set(this.inventoryIdxKey(phoneNumber), code);
    return code;
  }

  // Read-only — every reopen of the CTA resolves the same code. Also checks
  // the per-phone index so a stale code that survived a missed delete can't
  // be used once a newer one was minted.
  async resolveInventoryCode(code: string): Promise<string | null> {
    const phoneNumber = await this.redis.get(this.inventoryKey(code));
    if (!phoneNumber) return null;
    const current = await this.redis.get(this.inventoryIdxKey(phoneNumber));
    if (current !== code) return null;
    this.logger.log(
      `inventory code resolved for phone=${maskTail(phoneNumber)}`,
    );
    return phoneNumber;
  }

  // Idempotent — safe to call whether or not the phone has a live code.
  async killInventoryCodeForPhone(phoneNumber: string): Promise<void> {
    const code = await this.redis.get(this.inventoryIdxKey(phoneNumber));
    if (!code) return;
    await Promise.all([
      this.redis.del(this.inventoryKey(code)),
      this.redis.del(this.inventoryIdxKey(phoneNumber)),
    ]);
  }

  // Draft-confirmation CTA: scoped to one phone + correlationId, same TTL as
  // the conversation-state record it points to. Reusable up to
  // EXCHANGE_CODE_MAX_ATTEMPTS times (default 3) so accidentally closing the
  // webview before confirming doesn't dead-end the CTA link — killed outright
  // on confirm via killExchangeCodeForCorrelation, or once attempts run out.
  async mintExchangeCode(
    phoneNumber: string,
    correlationId: string,
  ): Promise<string> {
    const code = randomUUID();
    const ttl = this.config.get<number>('CONVERSATION_STATE_TTL_SECONDS', 900);
    const maxAttempts = this.config.get<number>(
      'EXCHANGE_CODE_MAX_ATTEMPTS',
      3,
    );
    const payload: ExchangeCodePayload = {
      phoneNumber,
      correlationId,
      attemptsRemaining: maxAttempts,
    };
    await this.redis.set(
      this.exchangeKey(code),
      JSON.stringify(payload),
      'EX',
      ttl,
    );
    // Reverse index so killExchangeCodeForCorrelation can burn the code from
    // the confirm path, which only knows correlationId, not the original code.
    await this.redis.set(this.exchangeIdxKey(correlationId), code, 'EX', ttl);
    return code;
  }

  // Decrements attemptsRemaining on each read instead of deleting outright.
  // On success, mints the webview session token the caller will hand back to
  // the webview alongside the draft.
  async consumeExchangeCode(
    code: string,
  ): Promise<ConsumedExchangeCode | null> {
    const raw = await this.redis.get(this.exchangeKey(code));
    if (!raw) return null;

    const payload = JSON.parse(raw) as ExchangeCodePayload;
    if (payload.attemptsRemaining <= 0) {
      await this.redis.del(this.exchangeKey(code));
      return null;
    }

    payload.attemptsRemaining -= 1;
    if (payload.attemptsRemaining <= 0) {
      await this.redis.del(this.exchangeKey(code));
    } else {
      // KEEPTTL: don't reset the countdown on every reopen — still bounded by
      // the original draft TTL.
      await this.redis.set(
        this.exchangeKey(code),
        JSON.stringify(payload),
        'KEEPTTL',
      );
    }

    const { phoneNumber, correlationId } = payload;
    const sessionToken = await this.webviewSessionService.createSession({
      phoneNumber,
      correlationId,
    });
    this.logger.log(
      `exchange code consumed for phone=${maskTail(phoneNumber)}, correlationId=${correlationId}, attemptsRemaining=${payload.attemptsRemaining}`,
    );
    return { phoneNumber, correlationId, sessionToken };
  }

  // Burns the exchange code immediately once the draft is actually
  // confirmed, instead of waiting for remaining attempts or TTL to expire —
  // so a stale tab can't replay it after submission.
  async killExchangeCodeForCorrelation(correlationId: string): Promise<void> {
    const code = await this.redis.get(this.exchangeIdxKey(correlationId));
    if (!code) return;
    await Promise.all([
      this.redis.del(this.exchangeKey(code)),
      this.redis.del(this.exchangeIdxKey(correlationId)),
    ]);
  }

  private loginKey(code: string): string {
    return `webview-login:${code}`;
  }

  private inventoryKey(code: string): string {
    return `webview-inventory:${code}`;
  }

  private inventoryIdxKey(phoneNumber: string): string {
    return `webview-inventory-idx:${phoneNumber}`;
  }

  private exchangeKey(code: string): string {
    return `webview-exchange:${code}`;
  }

  private exchangeIdxKey(correlationId: string): string {
    return `webview-exchange-idx:${correlationId}`;
  }
}
