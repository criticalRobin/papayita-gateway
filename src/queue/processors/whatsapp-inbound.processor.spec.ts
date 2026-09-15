import type { ConfigService } from '@nestjs/config';
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
import type { AuthService } from '../../auth/auth.service';
import type { WebviewAuthService } from '../../webview-auth/webview-auth.service';
import type { DraftBuilderService } from '../../draft-builder/draft-builder.service';
import type { CreditNoteService } from '../../credit-note/credit-note.service';
import type { LlmClient } from '../../extraction/llm-client.interface';
import { ExtractionParseError } from '../../extraction/extraction.errors';
import {
  RetryableCoreApiError,
  TerminalCoreApiError,
} from '../../core-api/core-api.errors';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../dto/inbound-message-job.dto';
import { WhatsappInboundProcessor } from './whatsapp-inbound.processor';

function makeJob(data: InboundMessageJobDto): Job<InboundMessageJobDto> {
  return { id: data.whatsappMessageId, data } as Job<InboundMessageJobDto>;
}

const extractedBillingAttempt = {
  comprador: {
    tipoIdentificacion: null,
    identificacion: null,
    razonSocial: null,
  },
  items: [
    {
      idCliente: 'item-1',
      textoConsulta: 'pan',
      cantidad: 2,
      precioMencionado: 0.5,
    },
  ],
  precioTotalMencionado: null,
  formaPagoMencionada: null,
};

describe('WhatsappInboundProcessor', () => {
  let sendTextMessage: jest.Mock;
  let sendCtaMessage: jest.Mock;
  let downloadMedia: jest.Mock;
  let markAsRead: jest.Mock;
  let uploadMedia: jest.Mock;
  let sendDocumentMessage: jest.Mock;
  let transcribe: jest.Mock;
  let classify: jest.Mock;
  let getState: jest.Mock;
  let extract: jest.Mock;
  let getValidToken: jest.Mock;
  let logout: jest.Mock;
  let reset: jest.Mock;
  let mintLoginCode: jest.Mock;
  let mintExchangeCode: jest.Mock;
  let mintInventoryCode: jest.Mock;
  let buildDraft: jest.Mock;
  let requestByIdentificacion: jest.Mock;
  let client: WhatsappClient;
  let sttClient: SttClient;
  let llmClient: LlmClient;
  let classificationService: ClassificationService;
  let conversationStateService: ConversationStateService;
  let authService: AuthService;
  let webviewAuthService: WebviewAuthService;
  let draftBuilderService: DraftBuilderService;
  let creditNoteService: CreditNoteService;
  let config: ConfigService;
  let processor: WhatsappInboundProcessor;

  beforeEach(() => {
    sendTextMessage = jest.fn().mockResolvedValue(undefined);
    sendCtaMessage = jest.fn().mockResolvedValue(undefined);
    downloadMedia = jest.fn().mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/ogg',
    });
    markAsRead = jest.fn().mockResolvedValue(undefined);
    uploadMedia = jest.fn().mockResolvedValue('media-id-1');
    sendDocumentMessage = jest.fn().mockResolvedValue(undefined);
    transcribe = jest.fn().mockResolvedValue('quiero facturar dos colas');
    classify = jest.fn().mockResolvedValue({
      category: 'greeting',
      confidence: 1,
      method: 'rule',
    });
    getState = jest.fn().mockResolvedValue(createIdleRecord());
    extract = jest.fn().mockResolvedValue(extractedBillingAttempt);
    getValidToken = jest.fn().mockResolvedValue('valid-token');
    logout = jest.fn().mockResolvedValue(undefined);
    reset = jest.fn().mockResolvedValue(undefined);
    mintLoginCode = jest.fn().mockResolvedValue('login-code-1');
    mintExchangeCode = jest.fn().mockResolvedValue('exchange-code-1');
    mintInventoryCode = jest.fn().mockResolvedValue('inventory-code-1');
    buildDraft = jest
      .fn()
      .mockResolvedValue({ correlationId: 'corr-1', draft: {} });
    requestByIdentificacion = jest
      .fn()
      .mockResolvedValue({ correlationId: 'corr-cn-1', hasCandidates: true });
    client = {
      sendTextMessage,
      sendCtaMessage,
      downloadMedia,
      markAsRead,
      uploadMedia,
      sendDocumentMessage,
    };
    sttClient = { transcribe };
    llmClient = { extract };
    classificationService = { classify } as unknown as ClassificationService;
    conversationStateService = {
      getState,
      reset,
    } as unknown as ConversationStateService;
    authService = { getValidToken, logout } as unknown as AuthService;
    webviewAuthService = {
      mintLoginCode,
      mintExchangeCode,
      mintInventoryCode,
    } as unknown as WebviewAuthService;
    draftBuilderService = { buildDraft } as unknown as DraftBuilderService;
    creditNoteService = {
      requestByIdentificacion,
    } as unknown as CreditNoteService;
    config = {
      getOrThrow: () => 'https://webview.test',
    } as unknown as ConfigService;
    processor = new WhatsappInboundProcessor(
      client,
      sttClient,
      llmClient,
      classificationService,
      conversationStateService,
      authService,
      webviewAuthService,
      draftBuilderService,
      creditNoteService,
      config,
    );
  });

  describe('auth gate', () => {
    it('sends the nudge reply and skips classification/STT/LLM when unauthenticated', async () => {
      getValidToken.mockResolvedValue(null);
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.unauth',
        type: InboundMessageType.TEXT,
        text: 'quiero facturar dos colas',
      });

      await processor.process(job);

      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('iniciar sesión'),
      );
      expect(classify).not.toHaveBeenCalled();
      expect(extract).not.toHaveBeenCalled();
      expect(sendCtaMessage).not.toHaveBeenCalled();
    });

    it('does not transcribe audio when unauthenticated', async () => {
      getValidToken.mockResolvedValue(null);
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.unauth-audio',
        type: InboundMessageType.AUDIO,
        mediaId: 'media-1',
      });

      await processor.process(job);

      expect(downloadMedia).not.toHaveBeenCalled();
      expect(transcribe).not.toHaveBeenCalled();
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('iniciar sesión'),
      );
    });

    it('mints a login code and sends a CTA when the message is "iniciar sesión"', async () => {
      getValidToken.mockResolvedValue(null);
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.login',
        type: InboundMessageType.TEXT,
        text: 'Iniciar Sesión',
      });

      await processor.process(job);

      expect(mintLoginCode).toHaveBeenCalledWith('5219999999999');
      expect(sendCtaMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.any(String),
        expect.any(String),
        'https://webview.test/login?code=login-code-1',
      );
      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('recognizes the login command without accents', async () => {
      getValidToken.mockResolvedValue(null);
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.login-noaccent',
        type: InboundMessageType.TEXT,
        text: 'iniciar sesion',
      });

      await processor.process(job);

      expect(sendCtaMessage).toHaveBeenCalled();
    });

    it('proceeds to the normal pipeline once authenticated', async () => {
      getValidToken.mockResolvedValue('valid-token');
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.auth',
        type: InboundMessageType.TEXT,
        text: 'hola',
      });

      await processor.process(job);

      expect(classify).toHaveBeenCalledWith('hola');
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('asistente de facturación'),
      );
    });
  });

  describe('cerrar sesión', () => {
    it('logs out, resets conversation state, and sends the confirmation when authenticated', async () => {
      getValidToken.mockResolvedValue('valid-token');
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.logout',
        type: InboundMessageType.TEXT,
        text: 'cerrar sesion',
      });

      await processor.process(job);

      expect(logout).toHaveBeenCalledWith('5219999999999');
      expect(reset).toHaveBeenCalledWith('5219999999999');
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('Cerraste tu sesión'),
      );
      expect(sendCtaMessage).not.toHaveBeenCalled();
      expect(getValidToken).not.toHaveBeenCalled();
    });

    it('sends the same confirmation when the phone was never authenticated', async () => {
      getValidToken.mockResolvedValue(null);
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.logout-unauth',
        type: InboundMessageType.TEXT,
        text: 'cerrar sesion',
      });

      await processor.process(job);

      expect(logout).toHaveBeenCalledWith('5219999999999');
      expect(reset).toHaveBeenCalledWith('5219999999999');
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('Cerraste tu sesión'),
      );
      expect(getValidToken).not.toHaveBeenCalled();
      expect(sendCtaMessage).not.toHaveBeenCalled();
    });

    it('recognizes the command without accents and case-insensitively', async () => {
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.logout-noaccent',
        type: InboundMessageType.TEXT,
        text: 'CERRAR SESION',
      });

      await processor.process(job);

      expect(logout).toHaveBeenCalledWith('5219999999999');
    });

    it('sends exactly one message total (message-budget guard)', async () => {
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.logout-budget',
        type: InboundMessageType.TEXT,
        text: 'cerrar sesion',
      });

      await processor.process(job);

      expect(sendTextMessage).toHaveBeenCalledTimes(1);
      expect(sendCtaMessage).not.toHaveBeenCalled();
    });
  });

  describe('administrar productos', () => {
    it('mints an inventory code and sends a CTA, skipping classification, when authenticated', async () => {
      getValidToken.mockResolvedValue('valid-token');
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.inventory',
        type: InboundMessageType.TEXT,
        text: 'administrar productos',
      });

      await processor.process(job);

      expect(mintInventoryCode).toHaveBeenCalledWith('5219999999999');
      expect(sendCtaMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.any(String),
        expect.any(String),
        'https://webview.test/inventory?code=inventory-code-1',
      );
      expect(classify).not.toHaveBeenCalled();
      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('recognizes "administrar inventario" as an alias', async () => {
      getValidToken.mockResolvedValue('valid-token');
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.inventory-alias',
        type: InboundMessageType.TEXT,
        text: 'Administrar Inventario',
      });

      await processor.process(job);

      expect(mintInventoryCode).toHaveBeenCalled();
      expect(sendCtaMessage).toHaveBeenCalled();
    });

    it('redirects to the login CTA when unauthenticated', async () => {
      getValidToken.mockResolvedValue(null);
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.inventory-unauth',
        type: InboundMessageType.TEXT,
        text: 'administrar productos',
      });

      await processor.process(job);

      expect(mintInventoryCode).not.toHaveBeenCalled();
      expect(mintLoginCode).toHaveBeenCalledWith('5219999999999');
      expect(sendCtaMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.any(String),
        expect.any(String),
        'https://webview.test/login?code=login-code-1',
      );
    });
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

  describe('billing attempts', () => {
    beforeEach(() => {
      classify.mockResolvedValue({
        category: 'billing_attempt',
        confidence: 1,
        method: 'rule',
      });
    });

    it('extracts, builds the draft, mints an exchange code, and sends exactly one CTA (no text reply)', async () => {
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.billing',
        type: InboundMessageType.TEXT,
        text: '2 panes a 0.50',
      });

      await processor.process(job);

      expect(extract).toHaveBeenCalledWith('2 panes a 0.50');
      expect(buildDraft).toHaveBeenCalledWith(
        '5219999999999',
        extractedBillingAttempt,
      );
      expect(mintExchangeCode).toHaveBeenCalledWith('5219999999999', 'corr-1');
      expect(sendCtaMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.any(String),
        expect.any(String),
        'https://webview.test/draft?code=exchange-code-1',
      );
      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('sends the hardcoded failure reply (no CTA) on an extraction parse error', async () => {
      extract.mockRejectedValue(new ExtractionParseError('bad json'));
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.billing-parse-fail',
        type: InboundMessageType.TEXT,
        text: 'texto raro',
      });

      await processor.process(job);

      expect(sendCtaMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('facturación'),
      );
    });

    it('sends the hardcoded failure reply (no CTA) on a terminal Core API error from draft-builder', async () => {
      buildDraft.mockRejectedValue(new TerminalCoreApiError('bad request'));
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.billing-terminal',
        type: InboundMessageType.TEXT,
        text: '2 panes a 0.50',
      });

      await processor.process(job);

      expect(sendCtaMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('facturación'),
      );
    });

    it('propagates a retryable Core API error so BullMQ retries the whole job', async () => {
      buildDraft.mockRejectedValue(new RetryableCoreApiError('network blip'));
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.billing-retryable',
        type: InboundMessageType.TEXT,
        text: '2 panes a 0.50',
      });

      await expect(processor.process(job)).rejects.toThrow(
        RetryableCoreApiError,
      );
      expect(sendCtaMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe('credit-note requests', () => {
    beforeEach(() => {
      classify.mockResolvedValue({
        category: 'credit_note_request',
        confidence: 1,
        method: 'rule',
      });
    });

    it('extracts the id number, requests candidates, mints an exchange code, and sends exactly one CTA (no text reply)', async () => {
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.credit-note',
        type: InboundMessageType.TEXT,
        text: 'emite una nota de credito al cliente 1850137918',
      });

      await processor.process(job);

      expect(requestByIdentificacion).toHaveBeenCalledWith(
        '5219999999999',
        '1850137918',
      );
      expect(mintExchangeCode).toHaveBeenCalledWith(
        '5219999999999',
        'corr-cn-1',
      );
      expect(sendCtaMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.any(String),
        expect.any(String),
        'https://webview.test/credit-note?code=exchange-code-1',
      );
      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('sends the no-invoices reply (no CTA) when there are no AUTORIZADO candidates', async () => {
      requestByIdentificacion.mockResolvedValue({
        correlationId: '',
        hasCandidates: false,
      });
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.credit-note-empty',
        type: InboundMessageType.TEXT,
        text: 'emite una nota de credito al cliente 1850137918',
      });

      await processor.process(job);

      expect(sendCtaMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('facturas autorizadas'),
      );
    });

    it('sends the hardcoded failure reply (no CTA) on a terminal Core API error', async () => {
      requestByIdentificacion.mockRejectedValue(
        new TerminalCoreApiError('bad request'),
      );
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.credit-note-terminal',
        type: InboundMessageType.TEXT,
        text: 'emite una nota de credito al cliente 1850137918',
      });

      await processor.process(job);

      expect(sendCtaMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).toHaveBeenCalledWith(
        '5219999999999',
        expect.stringContaining('nota de crédito'),
      );
    });

    it('propagates a retryable Core API error so BullMQ retries the whole job', async () => {
      requestByIdentificacion.mockRejectedValue(
        new RetryableCoreApiError('network blip'),
      );
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.credit-note-retryable',
        type: InboundMessageType.TEXT,
        text: 'emite una nota de credito al cliente 1850137918',
      });

      await expect(processor.process(job)).rejects.toThrow(
        RetryableCoreApiError,
      );
      expect(sendCtaMessage).not.toHaveBeenCalled();
      expect(sendTextMessage).not.toHaveBeenCalled();
    });

    it('never calls the LLM extractor for a credit-note request', async () => {
      const job = makeJob({
        phoneNumber: '5219999999999',
        whatsappMessageId: 'wamid.credit-note-no-llm',
        type: InboundMessageType.TEXT,
        text: 'emite una nota de credito al cliente 1850137918',
      });

      await processor.process(job);

      expect(extract).not.toHaveBeenCalled();
    });
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
      state: 'awaiting_webview_action',
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

    it('downloads the media, transcribes it, and classifies the transcript for a billing attempt', async () => {
      classify.mockResolvedValue({
        category: 'billing_attempt',
        confidence: 0.9,
        method: 'embedding',
      });

      await processor.process(audioJob());

      expect(downloadMedia).toHaveBeenCalledWith('media-1');
      expect(transcribe).toHaveBeenCalledWith(Buffer.from('audio'));
      expect(classify).toHaveBeenCalledWith('quiero facturar dos colas');
      expect(extract).toHaveBeenCalledWith('quiero facturar dos colas');
      expect(sendCtaMessage).toHaveBeenCalled();
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
