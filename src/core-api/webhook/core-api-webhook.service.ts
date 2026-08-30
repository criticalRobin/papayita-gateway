import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { maskTail } from '../../common/redact';
import { CoreApiWebhookDto } from './dto/core-api-webhook.dto';

const HANDLED_EVENTOS = new Set([
  'comprobante.autorizado',
  'comprobante.rechazado',
]);

@Injectable()
export class CoreApiWebhookService {
  private readonly logger = new Logger(CoreApiWebhookService.name);

  constructor(
    @InjectQueue('invoice-emission-events')
    private readonly queue: Queue<CoreApiWebhookDto>,
  ) {}

  async handlePayload(payload: CoreApiWebhookDto): Promise<void> {
    if (!HANDLED_EVENTOS.has(payload.evento)) {
      this.logger.log(`ignoring unhandled evento ${payload.evento}`);
      return;
    }

    if (!payload.payload.claveAcceso) {
      this.logger.error(
        `dropping ${payload.evento} for emisorId=${maskTail(payload.payload.emisorId)}: missing claveAcceso`,
      );
      return;
    }

    // Job ID = claveAcceso: this IS the dedupe against Core API's own webhook retries
    // (reintentosMax), same rationale as the WhatsApp inbound webhook's message-ID dedupe.
    await this.queue.add('comprobante-event', payload, {
      jobId: payload.payload.claveAcceso,
    });
    this.logger.log(
      `enqueued ${payload.evento} for emisorId=${maskTail(payload.payload.emisorId)}`,
    );
  }
}
