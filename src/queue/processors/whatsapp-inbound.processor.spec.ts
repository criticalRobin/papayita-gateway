import type { Job } from 'bullmq';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import {
  RetryableWhatsappError,
  TerminalWhatsappError,
} from '../../whatsapp/client/whatsapp.errors';
import type { SttClient } from '../../stt/stt-client.interface';
import { RetryableSttError, TerminalSttError } from '../../stt/stt.errors';
import type { ClassificationService } from '../../classification/classification.service';
import type { ConversationStateService } from '../../conversation-state/conversation-state.service';
import { createIdleRecord } from '../../conversation-state/domain/state-machine';
import type { LlmClient } from '../../extraction/llm-client.interface';
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
  let markAsRead: jest.Mock;
  let transcribe: jest.Mock;
  let classify: jest.Mock;
  let getState: jest.Mock;
  let extract: jest.Mock;
  let client: WhatsappClient;
  let sttClient: SttClient;
  let llmClient: LlmClient;
  let classificationService: ClassificationService;
  let conversationStateService: ConversationStateService;
  let processor: WhatsappInboundProcessor;

  beforeEach(() => {
    sendTextMessage = jest.fn().mockResolvedValue(undefined);
    downloadMedia = jest.fn().mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/ogg',
    });
    markAsRead = jest.fn().mockResolvedValue(undefined);
    transcribe = jest.fn().mockResolvedValue('quiero facturar dos colas');
    classify = jest
      .fn()
      .mockResolvedValue({ category: 'greeting', confidence: 1, method: 'rule' });
    getState = jest.fn().mockResolvedValue(createIdleRecord());
    extract = jest.fn().mockResolvedValue('{"products":[]}');
    client = { sendTextMessage, downloadMedia, markAsRead };
    sttClient = { transcribe };
    llmClient = { extract };
    classificationService = { classify } as unknown as ClassificationService;
    conversationStateService = {
      getState,
    } as unknown as ConversationStateService;
    processor = new WhatsappInboundProcessor(
      client,
      sttClient,
      llmClient,
      classificationService,
      conversationStateService,
    );
  });

  it('classifies text messages and replies with the matching hardcoded message', async () => {
    classify.mockResolvedValue({
      category: 'greeting',
      confidence: 1,
      method: 'rule',
    });
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.1',
      type: InboundMessageType.TEXT,
      text: 'hola',
    });

    await processor.process(job);

    expect(getState).toHaveBeenCalledWith('5219999999999');
    expect(classify).toHaveBeenCalledWith('hola');
    expect(sendTextMessage).toHaveBeenCalledWith(
      '5219999999999',
      expect.stringContaining('asistente de facturación'),
    );
  });

  it.each([
    ['greeting', 'asistente de facturación'],
    ['info_request', 'emitir tus facturas'],
    ['out_of_context', 'entender tu mensaje'],
  ] as const)(
    'sends the reply matching the %s category',
    async (category, expectedSubstring) => {
      classify.mockResolvedValue({ category, confidence: 1, method: 'rule' });
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: `wamid.${category}`,
        type: InboundMessageType.TEXT,
        text: 'cualquier mensaje',
      });

      await processor.process(job);

      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining(expectedSubstring),
      );
    },
  );

  it('extracts fields via the LLM client and sends the result for billing attempts', async () => {
    classify.mockResolvedValue({
      category: 'billing_attempt',
      confidence: 1,
      method: 'rule',
    });
    extract.mockResolvedValue('{"products":[{"producto":"pan"}]}');
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.billing',
      type: InboundMessageType.TEXT,
      text: '2 panes a 0.50',
    });

    await processor.process(job);

    expect(extract).toHaveBeenCalledWith('2 panes a 0.50');
    expect(sendTextMessage).toHaveBeenCalledWith(
      '5219999999999',
      '{"products":[{"producto":"pan"}]}',
    );
  });

  it('marks the inbound message as read before building a reply', async () => {
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.read',
      type: InboundMessageType.TEXT,
      text: 'hola',
    });

    await processor.process(job);

    expect(markAsRead).toHaveBeenCalledWith('wamid.read');
  });

  it('skips classification and echoes the message when mid-billing-flow', async () => {
    getState.mockResolvedValue({
      ...createIdleRecord(),
      state: 'awaiting_confirmation',
    });
    const job = makeJob({
      phoneNumber: '5219999999999',
      whatsappMessageId: 'wamid.pending',
      type: InboundMessageType.TEXT,
      text: 'si esta bien',
    });

    await processor.process(job);

    expect(classify).not.toHaveBeenCalled();
    expect(sendTextMessage).toHaveBeenCalledWith(
      '5219999999999',
      'Recibimos tu mensaje: "si esta bien"',
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
    expect(getState).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
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

    it('downloads the media, transcribes it, and classifies the transcript', async () => {
      classify.mockResolvedValue({
        category: 'billing_attempt',
        confidence: 0.9,
        method: 'embedding',
      });
      extract.mockResolvedValue('{"products":[]}');

      await processor.process(audioJob());

      expect(downloadMedia).toHaveBeenCalledWith('media-1');
      expect(transcribe).toHaveBeenCalledWith(Buffer.from('audio'));
      expect(classify).toHaveBeenCalledWith('quiero facturar dos colas');
      expect(extract).toHaveBeenCalledWith('quiero facturar dos colas');
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        '{"products":[]}',
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
