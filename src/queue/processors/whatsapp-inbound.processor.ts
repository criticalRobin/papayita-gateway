import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WHATSAPP_CLIENT } from '../../whatsapp/client/whatsapp.module';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import { TerminalWhatsappError } from '../../whatsapp/client/whatsapp.errors';
import { STT_CLIENT } from '../../stt/stt.module';
import type { SttClient } from '../../stt/stt-client.interface';
import { TerminalSttError } from '../../stt/stt.errors';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../dto/inbound-message-job.dto';

// Hardcoded, deterministic replies — no LLM call here (project-info.md constraint #5).
// Real classification/extraction pipeline lands in a later feature.
const STT_FAILURE_REPLY =
  'No pudimos entender tu nota de voz, por favor escribe tu mensaje.';
const UNSUPPORTED_REPLY =
  'No pudimos procesar ese tipo de mensaje, por favor escribe tu mensaje en texto.';

// concurrency: 1 — global ordering guarantee, see project-info.md / CLAUDE.md. Don't change without understanding why.
@Processor('whatsapp-messages', { concurrency: 1 })
export class WhatsappInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappInboundProcessor.name);

  constructor(
    @Inject(WHATSAPP_CLIENT) private readonly whatsappClient: WhatsappClient,
    @Inject(STT_CLIENT) private readonly sttClient: SttClient,
  ) {
    super();
  }

  async process(job: Job<InboundMessageJobDto>): Promise<void> {
    const { phoneNumber, type, text, mediaId } = job.data;
    this.logger.log(`processing ${type} message, job ${job.id}`);

    const reply = await this.buildReply(type, text, mediaId, job.id);

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

  private async buildReply(
    type: InboundMessageType,
    text: string | undefined,
    mediaId: string | undefined,
    jobId: string | number | undefined,
  ): Promise<string> {
    switch (type) {
      case InboundMessageType.TEXT:
        return `Recibimos tu mensaje: "${text}"`;
      case InboundMessageType.AUDIO:
        return this.buildAudioReply(mediaId as string, jobId);
      case InboundMessageType.UNSUPPORTED:
        return UNSUPPORTED_REPLY;
    }
  }

  // Audio is the only message type needing two external calls (media download, then
  // transcription) before a reply can be built. Terminal failures on either call still
  // get a reply (the fallback) — unlike a terminal *send* failure, there's nothing left
  // to do there. Retryable failures propagate so BullMQ retries the whole job (media is
  // re-fetched on retry; acceptable at MVP volume).
  private async buildAudioReply(
    mediaId: string,
    jobId: string | number | undefined,
  ): Promise<string> {
    try {
      const { buffer } = await this.whatsappClient.downloadMedia(mediaId);
      const transcript = await this.sttClient.transcribe(buffer);
      if (!transcript) {
        this.logger.warn(`empty transcript for job ${jobId}`);
        return STT_FAILURE_REPLY;
      }
      return `Recibimos tu nota de voz: "${transcript}"`;
    } catch (error) {
      if (
        error instanceof TerminalWhatsappError ||
        error instanceof TerminalSttError
      ) {
        this.logger.error(
          `terminal audio-processing failure on job ${jobId}: ${error.message}`,
        );
        return STT_FAILURE_REPLY;
      }
      throw error; // RetryableWhatsappError / RetryableSttError — let BullMQ retry
    }
  }
}
