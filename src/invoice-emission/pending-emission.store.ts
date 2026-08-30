import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

export const INVOICE_EMISSION_REDIS_CLIENT = 'INVOICE_EMISSION_REDIS_CLIENT';

export interface PendingEmission {
  phoneNumber: string;
  correlationId: string;
}

// Correlates an async comprobante.autorizado/rechazado webhook back to the WhatsApp
// conversation that triggered it. Core API's emit response has no claveAcceso, and its
// webhook payload has no jobId/correlationId — only emisorId — so this is keyed by
// emisorId alone. KNOWN MVP LIMITATION: a second concurrent emission for the same
// emisorId overwrites the first's pending record before its webhook arrives. Acceptable
// pre-launch (single emission per business in flight); revisit before scaling traffic.
@Injectable()
export class PendingEmissionStore {
  constructor(
    @Inject(INVOICE_EMISSION_REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async set(emisorId: string, pending: PendingEmission): Promise<void> {
    const ttl = this.config.get<number>(
      'INVOICE_EMISSION_PENDING_TTL_SECONDS',
      3600,
    );
    await this.redis.set(
      this.key(emisorId),
      JSON.stringify(pending),
      'EX',
      ttl,
    );
  }

  async get(emisorId: string): Promise<PendingEmission | null> {
    const raw = await this.redis.get(this.key(emisorId));
    return raw ? (JSON.parse(raw) as PendingEmission) : null;
  }

  async clear(emisorId: string): Promise<void> {
    await this.redis.del(this.key(emisorId));
  }

  private key(emisorId: string): string {
    return `invoice-emission:pending:${emisorId}`;
  }
}
