import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { Queue } from 'bullmq';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../../queue/dto/inbound-message-job.dto';
import { WebhookService } from './webhook.service';
import type { WhatsappWebhookPayloadDto } from './dto/whatsapp-webhook.dto';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function makeQueue(): { queue: Queue<InboundMessageJobDto>; add: jest.Mock } {
  const add = jest.fn().mockResolvedValue(undefined);
  return { queue: { add } as unknown as Queue<InboundMessageJobDto>, add };
}

function payloadWithMessages(
  messages: unknown[],
  extra: Partial<{ statuses: unknown[] }> = {},
): WhatsappWebhookPayloadDto {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: { messages: messages as never, ...extra },
          },
        ],
      },
    ],
  };
}

describe('WebhookService', () => {
  describe('verifyChallenge', () => {
    it('returns the challenge when mode and token match', () => {
      const service = new WebhookService(
        makeConfig({ WEBHOOK_VERIFY_TOKEN: 'secret-token' }),
        makeQueue().queue,
      );
      expect(
        service.verifyChallenge('subscribe', 'secret-token', 'challenge-123'),
      ).toBe('challenge-123');
    });

    it('throws when the token does not match', () => {
      const service = new WebhookService(
        makeConfig({ WEBHOOK_VERIFY_TOKEN: 'secret-token' }),
        makeQueue().queue,
      );
      expect(() =>
        service.verifyChallenge('subscribe', 'wrong-token', 'challenge-123'),
      ).toThrow(ForbiddenException);
    });

    it('throws when mode is not subscribe', () => {
      const service = new WebhookService(
        makeConfig({ WEBHOOK_VERIFY_TOKEN: 'secret-token' }),
        makeQueue().queue,
      );
      expect(() =>
        service.verifyChallenge('unsubscribe', 'secret-token', 'challenge-123'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('verifySignature', () => {
    it('does not throw when META_APP_SECRET is unset (skips verification)', () => {
      const service = new WebhookService(makeConfig({}), makeQueue().queue);
      expect(() =>
        service.verifySignature(Buffer.from('{}'), undefined),
      ).not.toThrow();
    });

    it('accepts a valid signature', () => {
      const service = new WebhookService(
        makeConfig({ META_APP_SECRET: 'app-secret' }),
        makeQueue().queue,
      );
      const body = Buffer.from(JSON.stringify({ hello: 'world' }));
      const signature = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
      expect(() => service.verifySignature(body, signature)).not.toThrow();
    });

    it('rejects an invalid signature', () => {
      const service = new WebhookService(
        makeConfig({ META_APP_SECRET: 'app-secret' }),
        makeQueue().queue,
      );
      const body = Buffer.from(JSON.stringify({ hello: 'world' }));
      expect(() => service.verifySignature(body, 'sha256=deadbeef')).toThrow(
        ForbiddenException,
      );
    });

    it('rejects a missing signature header when a secret is configured', () => {
      const service = new WebhookService(
        makeConfig({ META_APP_SECRET: 'app-secret' }),
        makeQueue().queue,
      );
      expect(() =>
        service.verifySignature(Buffer.from('{}'), undefined),
      ).toThrow(ForbiddenException);
    });
  });

  describe('handlePayload', () => {
    it('enqueues a text message with the WhatsApp message ID as job ID', async () => {
      const { queue, add } = makeQueue();
      const service = new WebhookService(makeConfig({}), queue);
      const payload = payloadWithMessages([
        {
          from: '5219999999999',
          id: 'wamid.TEXT1',
          type: 'text',
          text: { body: 'hola' },
        },
      ]);

      await service.handlePayload(payload);

      expect(add).toHaveBeenCalledWith(
        'inbound',
        expect.objectContaining({
          type: InboundMessageType.TEXT,
          text: 'hola',
          whatsappMessageId: 'wamid.TEXT1',
        }),
        { jobId: 'wamid.TEXT1' },
      );
    });

    it('enqueues an audio message with mediaId set', async () => {
      const { queue, add } = makeQueue();
      const service = new WebhookService(makeConfig({}), queue);
      const payload = payloadWithMessages([
        {
          from: '5219999999999',
          id: 'wamid.AUDIO1',
          type: 'audio',
          audio: { id: 'media-1' },
        },
      ]);

      await service.handlePayload(payload);

      expect(add).toHaveBeenCalledWith(
        'inbound',
        expect.objectContaining({
          type: InboundMessageType.AUDIO,
          mediaId: 'media-1',
        }),
        { jobId: 'wamid.AUDIO1' },
      );
    });

    it('enqueues a document message with mediaId and fileName set', async () => {
      const { queue, add } = makeQueue();
      const service = new WebhookService(makeConfig({}), queue);
      const payload = payloadWithMessages([
        {
          from: '5219999999999',
          id: 'wamid.DOC1',
          type: 'document',
          document: {
            id: 'media-2',
            filename: 'factura-compra.xml',
            mime_type: 'application/xml',
          },
        },
      ]);

      await service.handlePayload(payload);

      expect(add).toHaveBeenCalledWith(
        'inbound',
        expect.objectContaining({
          type: InboundMessageType.DOCUMENT,
          mediaId: 'media-2',
          fileName: 'factura-compra.xml',
        }),
        { jobId: 'wamid.DOC1' },
      );
    });

    it('maps unrecognized message types to UNSUPPORTED', async () => {
      const { queue, add } = makeQueue();
      const service = new WebhookService(makeConfig({}), queue);
      const payload = payloadWithMessages([
        { from: '5219999999999', id: 'wamid.STICKER1', type: 'sticker' },
      ]);

      await service.handlePayload(payload);

      expect(add).toHaveBeenCalledWith(
        'inbound',
        expect.objectContaining({ type: InboundMessageType.UNSUPPORTED }),
        {
          jobId: 'wamid.STICKER1',
        },
      );
    });

    it('does not enqueue anything for a status-only payload', async () => {
      const { queue, add } = makeQueue();
      const service = new WebhookService(makeConfig({}), queue);
      const payload = payloadWithMessages([], {
        statuses: [{ id: 'wamid.X', status: 'delivered' }],
      });

      await service.handlePayload(payload);

      expect(add).not.toHaveBeenCalled();
    });
  });
});
