import type { Job } from 'bullmq';
import type { AuthService } from '../../auth/auth.service';
import type { ConversationStateService } from '../../conversation-state/conversation-state.service';
import type { CoreApiWebhookDto } from '../../core-api/webhook/dto/core-api-webhook.dto';
import type { PendingEmissionStore } from '../../invoice-emission/pending-emission.store';
import { InvoiceEmissionProcessor } from './invoice-emission.processor';

const emisorId = 'emisor-1';
const phoneNumber = '+593993908744';
const claveAcceso = 'clave-1';

function makeProcessor(
  overrides: {
    pending?: { phoneNumber: string; correlationId: string } | null;
    authToken?: string | null;
  } = {},
) {
  // Loose mock shapes (not typed as the real interface) — referencing a real
  // interface's method as a value trips @typescript-eslint/unbound-method,
  // since these are plain jest.fn doubles with no `this` binding to worry
  // about. The interface type is only applied at the constructor call below.
  const invoiceEmissionClient = {
    emitir: jest.fn(),
    getRide: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
  };

  const whatsappClient = {
    sendTextMessage: jest.fn().mockResolvedValue(undefined),
    sendCtaMessage: jest.fn().mockResolvedValue(undefined),
    downloadMedia: jest.fn(),
    markAsRead: jest.fn(),
    uploadMedia: jest.fn().mockResolvedValue('media-1'),
    sendDocumentMessage: jest.fn().mockResolvedValue(undefined),
  };

  const pendingEmissionStore = {
    get: jest
      .fn()
      .mockResolvedValue(
        overrides.pending === undefined
          ? { phoneNumber, correlationId: 'corr-1' }
          : overrides.pending,
      ),
    set: jest.fn(),
    clear: jest.fn().mockResolvedValue(undefined),
  };

  const applyEvent = jest.fn().mockResolvedValue(undefined);
  const conversationStateService = {
    applyEvent,
    getState: jest.fn(),
  };

  const authService = {
    getValidToken: jest
      .fn()
      .mockResolvedValue(
        overrides.authToken === undefined ? 'token-1' : overrides.authToken,
      ),
  };

  const processor = new InvoiceEmissionProcessor(
    invoiceEmissionClient,
    whatsappClient,
    pendingEmissionStore as unknown as PendingEmissionStore,
    conversationStateService as unknown as ConversationStateService,
    authService as unknown as AuthService,
  );

  return {
    processor,
    invoiceEmissionClient,
    whatsappClient,
    pendingEmissionStore,
    conversationStateService,
    applyEvent,
    authService,
  };
}

function makeJob(data: CoreApiWebhookDto, attemptsMade = 1, attempts = 3) {
  return {
    id: claveAcceso,
    data,
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<CoreApiWebhookDto>;
}

describe('InvoiceEmissionProcessor', () => {
  describe('process', () => {
    it('fetches the RIDE, uploads it, and sends a WhatsApp document on comprobante.autorizado', async () => {
      const {
        processor,
        invoiceEmissionClient,
        whatsappClient,
        pendingEmissionStore,
        applyEvent,
      } = makeProcessor();

      await processor.process(
        makeJob({
          evento: 'comprobante.autorizado',
          payload: { emisorId, claveAcceso, tipoComprobante: '01' },
        }),
      );

      expect(invoiceEmissionClient.getRide).toHaveBeenCalledWith(
        'token-1',
        claveAcceso,
      );
      expect(whatsappClient.uploadMedia).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'application/pdf',
        `factura-${claveAcceso}.pdf`,
      );
      expect(whatsappClient.sendDocumentMessage).toHaveBeenCalledWith(
        phoneNumber,
        'media-1',
        `factura-${claveAcceso}.pdf`,
      );
      expect(pendingEmissionStore.clear).toHaveBeenCalledWith(emisorId);
      expect(applyEvent).toHaveBeenCalledWith(phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
    });

    it('sends a plain-language rejection message on comprobante.rechazado', async () => {
      const { processor, whatsappClient, pendingEmissionStore, applyEvent } =
        makeProcessor();

      await processor.process(
        makeJob({
          evento: 'comprobante.rechazado',
          payload: {
            emisorId,
            claveAcceso,
            tipoComprobante: '01',
            estado: 'DEVUELTA',
            mensajes: [
              {
                identificador: '35',
                mensaje: 'ARCHIVO NO CUMPLE ESTRUCTURA XML',
                tipo: 'ERROR',
              },
            ],
          },
        }),
      );

      expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
        phoneNumber,
        expect.stringContaining('ARCHIVO NO CUMPLE ESTRUCTURA XML'),
      );
      expect(pendingEmissionStore.clear).toHaveBeenCalledWith(emisorId);
      expect(applyEvent).toHaveBeenCalledWith(phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
    });

    it('drops the job when there is no pending emission for the emisorId', async () => {
      const { processor, whatsappClient, applyEvent } = makeProcessor({
        pending: null,
      });

      await processor.process(
        makeJob({
          evento: 'comprobante.autorizado',
          payload: { emisorId, claveAcceso, tipoComprobante: '01' },
        }),
      );

      expect(whatsappClient.sendDocumentMessage).not.toHaveBeenCalled();
      expect(applyEvent).not.toHaveBeenCalled();
    });

    it('ignores unhandled eventos', async () => {
      const { processor, whatsappClient, applyEvent } = makeProcessor();

      await processor.process(
        makeJob({
          evento: 'comprobante.creado',
          payload: { emisorId, claveAcceso, tipoComprobante: '01' },
        }),
      );

      expect(whatsappClient.sendTextMessage).not.toHaveBeenCalled();
      expect(whatsappClient.sendDocumentMessage).not.toHaveBeenCalled();
      expect(applyEvent).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('sends an escalation message once retries are exhausted', async () => {
      const { processor, whatsappClient, pendingEmissionStore, applyEvent } =
        makeProcessor();

      await processor.onFailed(
        makeJob(
          {
            evento: 'comprobante.autorizado',
            payload: { emisorId, claveAcceso, tipoComprobante: '01' },
          },
          3,
          3,
        ),
      );

      expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
        phoneNumber,
        expect.stringContaining('problema técnico'),
      );
      expect(pendingEmissionStore.clear).toHaveBeenCalledWith(emisorId);
      expect(applyEvent).toHaveBeenCalledWith(phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
    });

    it('does nothing while retries remain', async () => {
      const { processor, whatsappClient } = makeProcessor();

      await processor.onFailed(
        makeJob(
          {
            evento: 'comprobante.autorizado',
            payload: { emisorId, claveAcceso, tipoComprobante: '01' },
          },
          1,
          3,
        ),
      );

      expect(whatsappClient.sendTextMessage).not.toHaveBeenCalled();
    });
  });
});
