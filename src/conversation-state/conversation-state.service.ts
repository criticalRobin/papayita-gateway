import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { maskTail } from '../common/redact';
import {
  ConversationEvent,
  ConversationRecord,
  createIdleRecord,
  transition,
} from './domain/state-machine';

export const REDIS_CLIENT = 'CONVERSATION_STATE_REDIS_CLIENT';

@Injectable()
export class ConversationStateService {
  private readonly logger = new Logger(ConversationStateService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  // Read-only — does not refresh the record's TTL.
  async getState(phoneNumber: string): Promise<ConversationRecord> {
    return this.load(phoneNumber);
  }

  async applyEvent(
    phoneNumber: string,
    event: ConversationEvent,
  ): Promise<ConversationRecord> {
    const current = await this.load(phoneNumber);
    const next = transition(current, event);
    await this.save(phoneNumber, next);
    if (next.state !== current.state) {
      this.logger.log(
        `state: ${current.state} -> ${next.state} (phone=${maskTail(phoneNumber)})`,
      );
    }
    return next;
  }

  // Unconditional reset to idle for "cerrar sesión" — deleting the key is
  // equivalent to idle since load() already defaults to createIdleRecord()
  // when the key is absent. Idempotent: safe when nothing was set.
  async reset(phoneNumber: string): Promise<void> {
    await this.redis.del(this.key(phoneNumber));
    this.logger.log(`state: reset -> idle (phone=${maskTail(phoneNumber)})`);
  }

  private key(phoneNumber: string): string {
    return `conversation:${phoneNumber}`;
  }

  private async load(phoneNumber: string): Promise<ConversationRecord> {
    const raw = await this.redis.get(this.key(phoneNumber));
    if (!raw) {
      return createIdleRecord();
    }
    return JSON.parse(raw) as ConversationRecord;
  }

  private async save(
    phoneNumber: string,
    record: ConversationRecord,
  ): Promise<void> {
    const stamped: ConversationRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    const ttl = this.config.get<number>('CONVERSATION_STATE_TTL_SECONDS', 900);
    await this.redis.set(
      this.key(phoneNumber),
      JSON.stringify(stamped),
      'EX',
      ttl,
    );
  }
}
