import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WHATSAPP_CLIENT } from '../../whatsapp/client/whatsapp.module';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import { TerminalWhatsappError } from '../../whatsapp/client/whatsapp.errors';
import { STT_CLIENT } from '../../stt/stt.module';
import type { SttClient } from '../../stt/stt-client.interface';
import { TerminalSttError } from '../../stt/stt.errors';
import { ClassificationService } from '../../classification/classification.service';
import { ConversationStateService } from '../../conversation-state/conversation-state.service';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../dto/inbound-message-job.dto';
import { EXTRACTION_CLIENT } from '../../extraction/extraction.module';
import type { LlmClient } from '../../extraction/llm-client.interface';

// Hardcoded, deterministic replies — no LLM call here (project-info.md constraint #5).
const STT_FAILURE_REPLY =
  'No pudimos entender tu nota de voz, por favor escribe tu mensaje.';
const UNSUPPORTED_REPLY =
  'No pudimos procesar ese tipo de mensaje, por favor escribe tu mensaje en texto.';
const GREETING_REPLY =
  '¡Hola! Soy el asistente de facturación. Cuéntame qué necesitas facturar y te ayudo.';
const INFO_REQUEST_REPLY =
  'Con este servicio puedes emitir tus facturas autorizadas por el SRI directamente por WhatsApp. Cuéntame los datos de la venta cuando quieras facturar.';
const OUT_OF_CONTEXT_REPLY =
  'No pudimos entender tu mensaje. Si quieres emitir una factura, cuéntame los datos de la venta.';

// concurrency: 1 — global ordering guarantee, see project-info.md / CLAUDE.md. Don't change without understanding why.
@Processor('whatsapp-messages', { concurrency: 1 })
export class WhatsappInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappInboundProcessor.name);

  constructor(
    @Inject(WHATSAPP_CLIENT) private readonly whatsappClient: WhatsappClient,
    @Inject(STT_CLIENT) private readonly sttClient: SttClient,
    @Inject(EXTRACTION_CLIENT) private readonly llmClient: LlmClient,
    private readonly classificationService: ClassificationService,
    private readonly conversationStateService: ConversationStateService,
  ) {
    super();
  }

  async process(job: Job<InboundMessageJobDto>): Promise<void> {
    const { phoneNumber, type, text, mediaId, whatsappMessageId } = job.data;
    this.logger.log(`processing ${type} message, job ${job.id}`);
    await this.whatsappClient.markAsRead(whatsappMessageId);

    const reply = await this.buildReply(
      phoneNumber,
      type,
      text,
      mediaId,
      job.id,
    );

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
    phoneNumber: string,
    type: InboundMessageType,
    text: string | undefined,
    mediaId: string | undefined,
    jobId: string | number | undefined,
  ): Promise<string> {
    switch (type) {
      case InboundMessageType.TEXT:
        return this.buildClassifiedReply(phoneNumber, text as string);
      case InboundMessageType.AUDIO:
        return this.buildAudioReply(phoneNumber, mediaId as string, jobId);
      case InboundMessageType.UNSUPPORTED:
        return UNSUPPORTED_REPLY;
    }
  }

  // Gate: classification only runs when the conversation is idle. If the
  // user is mid-billing-flow, skip straight past classification.
  private async buildClassifiedReply(
    phoneNumber: string,
    text: string,
  ): Promise<string> {
    const record = await this.conversationStateService.getState(phoneNumber);
    if (record.state !== 'idle') {
      return `Recibimos tu mensaje: "${text}"`;
    }

    const { category } = await this.classificationService.classify(text);
    switch (category) {
      case 'greeting':
        return GREETING_REPLY;
      case 'info_request':
        return INFO_REQUEST_REPLY;
      case 'billing_attempt':
        return this.llmClient.extract(text);
      case 'out_of_context':
        return OUT_OF_CONTEXT_REPLY;
    }
  }

  // Audio is the only message type needing two external calls (media download, then
  // transcription) before a reply can be built. Terminal failures on either call still
  // get a reply (the fallback) — unlike a terminal *send* failure, there's nothing left
  // to do there. Retryable failures propagate so BullMQ retries the whole job (media is
  // re-fetched on retry; acceptable at MVP volume).
  private async buildAudioReply(
    phoneNumber: string,
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
      return this.buildClassifiedReply(phoneNumber, transcript);
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
