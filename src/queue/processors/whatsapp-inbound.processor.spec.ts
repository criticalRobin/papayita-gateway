import type { Job } from 'bullmq';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import {
  RetryableWhatsappError,
  TerminalWhatsappError,
} from '../../whatsapp/client/whatsapp.errors';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../dto/inbound-message-job.dto';
import { WhatsappInboundProcessor } from './whatsapp-inbound.processor';

function makeJob(data: InboundMessageJobDto): Job<InboundMessageJobDto> {
  return { id: data.whatsappMessageId, data } as Job<InboundMessageJobDto>;
}

describe('WhatsappInboundProcessor', () => {
  let sendTextMessage: jest.Mock;
  let client: WhatsappClient;
  let processor: WhatsappInboundProcessor;

  beforeEach(() => {
    sendTextMessage = jest.fn().mockResolvedValue(undefined);
    client = { sendTextMessage };
    processor = new WhatsappInboundProcessor(client);
  });

  it('echoes text messages back to the sender', async () => {
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.1',
      type: InboundMessageType.TEXT,
      text: 'hola',
    });

    await processor.process(job);

    expect(sendTextMessage).toHaveBeenCalledWith(
      '5219999999999',
      'Recibimos tu mensaje: "hola"',
    );
  });

  it('sends the hardcoded audio-not-supported reply for audio messages', async () => {
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.2',
      type: InboundMessageType.AUDIO,
      mediaId: 'media-1',
    });

    await processor.process(job);

    expect(sendTextMessage).toHaveBeenCalledWith(
      '5219999999999',
      expect.stringContaining('notas de voz'),
    );
  });

  it('sends the hardcoded generic reply for unsupported message types', async () => {
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.3',
      type: InboundMessageType.UNSUPPORTED,
    });

    await processor.process(job);

    expect(sendTextMessage).toHaveBeenCalledWith(
      '5219999999999',
      expect.stringContaining('tipo de mensaje'),
    );
  });

  it('swallows a terminal send failure instead of retrying', async () => {
    sendTextMessage.mockRejectedValueOnce(
      new TerminalWhatsappError('bad token'),
    );
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.4',
      type: InboundMessageType.TEXT,
      text: 'hola',
    });

    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('rethrows a retryable send failure so BullMQ retries it', async () => {
    sendTextMessage.mockRejectedValueOnce(
      new RetryableWhatsappError('network blip'),
    );
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.5',
      type: InboundMessageType.TEXT,
      text: 'hola',
    });

    await expect(processor.process(job)).rejects.toThrow(
      RetryableWhatsappError,
    );
  });
});
