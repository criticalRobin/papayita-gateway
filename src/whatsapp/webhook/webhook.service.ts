import { InjectQueue } from '@nestjs/bullmq';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHmac, timingSafeEqual } from 'crypto';
import { Queue } from 'bullmq';
import { maskTail } from '../../common/redact';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../../queue/dto/inbound-message-job.dto';
import {
  WhatsappMessageDto,
  WhatsappWebhookPayloadDto,
} from './dto/whatsapp-webhook.dto';

const SIGNATURE_PREFIX = 'sha256=';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private warnedNoSecret = false;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue('whatsapp-messages')
    private readonly queue: Queue<InboundMessageJobDto>,
  ) {}

  verifyChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string {
    const expectedToken = this.config.get<string>('WEBHOOK_VERIFY_TOKEN');
    if (mode !== 'subscribe' || token !== expectedToken || !challenge) {
      throw new ForbiddenException('invalid verify token');
    }
    return challenge;
  }

  // HMAC-SHA256 over the raw request body, per Meta's webhook security guide. Skipped (with a
  // one-time warning) until META_APP_SECRET is set — see CLAUDE.md / project-info.md open questions.
  verifySignature(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
  ): void {
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appSecret) {
      if (!this.warnedNoSecret) {
        this.logger.warn(
          'META_APP_SECRET not set — webhook signature verification is DISABLED. Set it before accepting real customer traffic.',
        );
        this.warnedNoSecret = true;
      }
      return;
    }

    if (!rawBody || !signatureHeader?.startsWith(SIGNATURE_PREFIX)) {
      throw new ForbiddenException('missing signature');
    }

    const expected = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');

    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new ForbiddenException('signature mismatch');
    }
  }

  async handlePayload(payload: WhatsappWebhookPayloadDto): Promise<void> {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        for (const message of change.value.messages ?? []) {
          await this.enqueueMessage(message);
        }
      }
    }
  }

  private async enqueueMessage(message: WhatsappMessageDto): Promise<void> {
    const jobData = plainToInstance(InboundMessageJobDto, {
      phoneNumber: message.from,
      whatsappMessageId: message.id,
      type: this.mapType(message.type),
      text: message.text?.body,
      mediaId: message.audio?.id ?? message.document?.id,
      fileName: message.document?.filename,
    });

    const errors = await validate(jobData);
    if (errors.length > 0) {
      this.logger.error(
        `dropping unparseable message ${maskTail(message.id)}: ${errors.map((e) => e.property).join(', ')}`,
      );
      return;
    }

    // Job ID = WhatsApp message ID: this IS the dedupe against Meta's webhook retries
    // (adding a job with an existing ID is a no-op) — see coding-guide.md.
    await this.queue.add('inbound', jobData, { jobId: message.id });
    this.logger.log(
      `enqueued ${jobData.type} message ${maskTail(message.id)} from ${maskTail(message.from)}`,
    );
  }

  private mapType(type: string): InboundMessageType {
    if (type === 'text') return InboundMessageType.TEXT;
    if (type === 'audio') return InboundMessageType.AUDIO;
    if (type === 'document') return InboundMessageType.DOCUMENT;
    return InboundMessageType.UNSUPPORTED;
  }
}
