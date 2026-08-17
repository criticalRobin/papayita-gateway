import type { Job } from 'bullmq';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import {
  RetryableWhatsappError,
  TerminalWhatsappError,
} from '../../whatsapp/client/whatsapp.errors';
import type { SttClient } from '../../stt/stt-client.interface';
import { RetryableSttError, TerminalSttError } from '../../stt/stt.errors';
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
  let downloadMedia: jest.Mock;
  let transcribe: jest.Mock;
  let client: WhatsappClient;
  let sttClient: SttClient;
  let processor: WhatsappInboundProcessor;

  beforeEach(() => {
    sendTextMessage = jest.fn().mockResolvedValue(undefined);
    downloadMedia = jest.fn().mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/ogg',
    });
    transcribe = jest.fn().mockResolvedValue('quiero facturar dos colas');
    client = { sendTextMessage, downloadMedia };
    sttClient = { transcribe };
    processor = new WhatsappInboundProcessor(client, sttClient);
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

  describe('audio messages', () => {
    function audioJob(overrides: Partial<InboundMessageJobDto> = {}) {
      return makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.audio',
        type: InboundMessageType.AUDIO,
        mediaId: 'media-1',
        ...overrides,
      });
    }

    it('downloads the media, transcribes it, and echoes the transcript', async () => {
      await processor.process(audioJob());

      expect(downloadMedia).toHaveBeenCalledWith('media-1');
      expect(transcribe).toHaveBeenCalledWith(Buffer.from('audio'));
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        'Recibimos tu nota de voz: "quiero facturar dos colas"',
      );
    });

    it('sends the fallback reply when the transcript is empty', async () => {
      transcribe.mockResolvedValueOnce('');

      await processor.process(audioJob());

      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('nota de voz'),
      );
    });

    it('sends the fallback reply on a terminal media-download failure', async () => {
      downloadMedia.mockRejectedValueOnce(
        new TerminalWhatsappError('media expired'),
      );

      await processor.process(audioJob());

      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('nota de voz'),
      );
    });

    it('rethrows a retryable media-download failure so BullMQ retries it', async () => {
      downloadMedia.mockRejectedValueOnce(
        new RetryableWhatsappError('network blip'),
      );

      await expect(processor.process(audioJob())).rejects.toThrow(
        RetryableWhatsappError,
      );
      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('sends the fallback reply on a terminal transcription failure', async () => {
      transcribe.mockRejectedValueOnce(
        new TerminalSttError('no speech detected'),
      );

      await processor.process(audioJob());

      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('nota de voz'),
      );
    });

    it('rethrows a retryable transcription failure so BullMQ retries it', async () => {
      transcribe.mockRejectedValueOnce(new RetryableSttError('rate limited'));

      await expect(processor.process(audioJob())).rejects.toThrow(
        RetryableSttError,
      );
      expect(sendTextMessage).not.toHaveBeenCalled();
    });
  });
});
