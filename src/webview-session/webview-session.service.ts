import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { WebviewSessionToken } from './webview-session-token';

export const WEBVIEW_SESSION_REDIS_CLIENT = 'WEBVIEW_SESSION_REDIS_CLIENT';

export interface WebviewSessionPayload {
  phoneNumber: string;
  correlationId: string;
}

// Owns only the session token — no knowledge of drafts or exchange codes.
// Kept as its own module (not folded into webview-auth) to avoid a circular
// Nest dependency: webview-auth needs draft-builder (to return the draft on
// exchange), draft-builder needs this guard — so this module sits neutrally
// between them, imported one-way by both.
@Injectable()
export class WebviewSessionService {
  constructor(
    @Inject(WEBVIEW_SESSION_REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async createSession(
    payload: WebviewSessionPayload,
  ): Promise<WebviewSessionToken> {
    const token = randomUUID() as WebviewSessionToken;
    const ttl = this.config.get<number>('CONVERSATION_STATE_TTL_SECONDS', 900);
    await this.redis.set(this.key(token), JSON.stringify(payload), 'EX', ttl);
    return token;
  }

  // Not single-use — re-validated on every request during the editing
  // session (GET draft, then later POST confirm), same TTL as the draft it
  // points to.
  async validateSession(
    token: WebviewSessionToken,
  ): Promise<WebviewSessionPayload | null> {
    const raw = await this.redis.get(this.key(token));
    if (!raw) return null;
    return JSON.parse(raw) as WebviewSessionPayload;
  }

  private key(token: WebviewSessionToken): string {
    return `webview-session:${token}`;
  }
}
