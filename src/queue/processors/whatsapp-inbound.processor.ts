import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WHATSAPP_CLIENT } from '../../whatsapp/client/whatsapp.module';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import { TerminalWhatsappError } from '../../whatsapp/client/whatsapp.errors';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../dto/inbound-message-job.dto';

// Hardcoded, deterministic replies — no LLM call here (project-info.md constraint #5).
// Real classification/extraction pipeline lands in a later feature.
const AUDIO_REPLY =
  'Las notas de voz aún no están soportadas, por favor escribe tu mensaje.';
const UNSUPPORTED_REPLY =
  'No pudimos procesar ese tipo de mensaje, por favor escribe tu mensaje en texto.';

// concurrency: 1 — global ordering guarantee, see project-info.md / CLAUDE.md. Don't change without understanding why.
@Processor('whatsapp-messages', { concurrency: 1 })
export class WhatsappInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappInboundProcessor.name);

  constructor(
    @Inject(WHATSAPP_CLIENT) private readonly whatsappClient: WhatsappClient,
  ) {
    super();
  }

  async process(job: Job<InboundMessageJobDto>): Promise<void> {
    const { phoneNumber, type, text } = job.data;
    this.logger.log(`processing ${type} message, job ${job.id}`);

    const reply = this.buildReply(type, text);

    try {
      await this.whatsappClient.sendTextMessage(phoneNumber, reply);
    } catch (error) {
      if (error instanceof TerminalWhatsappError) {
        // Retrying won't help (bad token, invalid recipient) — log and let the job complete rather than retry forever.
        this.logger.error(
          `terminal failure on job ${job.id}: ${error.message}`,
        );
        return;
      }
      throw error; // retryable — BullMQ retries per the queue's configured attempts/backoff
    }
  }

  private buildReply(type: InboundMessageType, text?: string): string {
    switch (type) {
      case InboundMessageType.TEXT:
        return `Recibimos tu mensaje: "${text}"`;
      case InboundMessageType.AUDIO:
        return AUDIO_REPLY;
      case InboundMessageType.UNSUPPORTED:
        return UNSUPPORTED_REPLY;
    }
  }
}
