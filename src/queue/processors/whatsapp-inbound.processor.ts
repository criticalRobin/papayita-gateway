import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { WHATSAPP_CLIENT } from '../../whatsapp/client/whatsapp.module';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import { TerminalWhatsappError } from '../../whatsapp/client/whatsapp.errors';
import { STT_CLIENT } from '../../stt/stt.module';
import type { SttClient } from '../../stt/stt-client.interface';
import { TerminalSttError } from '../../stt/stt.errors';
import { ClassificationService } from '../../classification/classification.service';
import {
  extractIdNumber,
  matchManageInventoryCommand,
  normalize,
} from '../../classification/domain/rules';
import { ConversationStateService } from '../../conversation-state/conversation-state.service';
import { AuthService } from '../../auth/auth.service';
import { WebviewAuthService } from '../../webview-auth/webview-auth.service';
import { DraftBuilderService } from '../../draft-builder/draft-builder.service';
import { UnresolvedCatalogItemsError } from '../../draft-builder/domain/errors';
import { CreditNoteService } from '../../credit-note/credit-note.service';
import { ExtractionParseError } from '../../extraction/extraction.errors';
import { TerminalCoreApiError } from '../../core-api/core-api.errors';
import {
  InboundMessageJobDto,
  InboundMessageType,
} from '../dto/inbound-message-job.dto';
import { EXTRACTION_CLIENT } from '../../extraction/extraction.module';
import type { LlmClient } from '../../extraction/llm-client.interface';
import { PURCHASES_CLIENT } from '../../purchases/purchases.module';
import type {
  PurchasesClient,
  PurchaseRegisteredResponse,
} from '../../purchases/purchases-client.interface';

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
const NOT_AUTHENTICATED_REPLY =
  'Para emitir facturas primero debes vincular tu cuenta. Escribe "iniciar sesión" para continuar.';
const LOGOUT_SUCCESS_REPLY =
  'Cerraste tu sesión correctamente. Escribe "iniciar sesión" cuando quieras volver a vincular tu cuenta.';
const LOGIN_CTA_BODY = 'Vincula tu cuenta para emitir facturas por WhatsApp.';
const LOGIN_CTA_BUTTON = 'Iniciar sesión';
const DRAFT_CTA_BODY =
  'Ya casi terminamos tu factura. Revisa y confirma los datos aquí:';
const DRAFT_CTA_BUTTON = 'Ver borrador';
const BILLING_FAILURE_REPLY =
  'No pudimos procesar tu solicitud de facturación, por favor intenta de nuevo.';
const UNRESOLVED_PRODUCTS_REPLY = (missingTerms: string[]): string =>
  `No encontramos en tu catálogo: ${missingTerms.join(', ')}. Agrégalos a tu inventario o revisa el nombre e intenta de nuevo.`;
const INVENTORY_CTA_BODY = 'Administra tus categorías y productos desde aquí:';
const INVENTORY_CTA_BUTTON = 'Ver inventario';
const CREDIT_NOTE_CTA_BODY =
  'Selecciona la factura y los productos para tu nota de crédito aquí:';
const CREDIT_NOTE_CTA_BUTTON = 'Ver facturas';
const CREDIT_NOTE_FAILURE_REPLY =
  'No pudimos procesar tu solicitud de nota de crédito, por favor intenta de nuevo.';
const CREDIT_NOTE_NO_INVOICES_REPLY =
  'No encontramos facturas autorizadas para ese cliente, verifica el número e intenta de nuevo.';
const CREDIT_NOTE_NO_ID_REPLY =
  'No pudimos identificar el número de cédula/RUC del cliente, por favor incluye el número completo.';
const PURCHASE_INVALID_FILE_REPLY =
  'Solo aceptamos el archivo XML de la factura de compra, por favor envíalo como documento adjunto.';
const PURCHASE_FAILURE_REPLY =
  'No pudimos registrar tu compra, por favor verifica el XML e intenta de nuevo.';
const PURCHASE_SUCCESS_REPLY = (response: PurchaseRegisteredResponse): string =>
  `Compra registrada: ${response.proveedorRazonSocial}, comprobante ${response.establecimiento}-${response.puntoEmision}-${response.secuencial}, total $${response.importeTotal.toFixed(2)}.`;

// Accent-insensitive: typing "sesion" without the tilde on a phone keyboard
// is common. "login" is accepted as a plain-English fallback.
function isLoginCommand(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (e.g. "sesión" -> "sesion")
    .trim()
    .toLowerCase();
  return normalized === 'iniciar sesion' || normalized === 'login';
}

function isLogoutCommand(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return normalized === 'cerrar sesion' || normalized === 'logout';
}

// buildReply()/buildClassifiedReply()/buildAudioReply() return one of these:
// 'text' means process() still needs to send the given text via sendTextMessage;
// 'handled' means the branch already sent (or terminally failed to send) its
// own message — billing attempts send a CTA, not a text reply, and must not
// fall through to the generic text-reply path (2-message budget: exactly one
// message per outcome).
type ReplyOutcome = { kind: 'text'; text: string } | { kind: 'handled' };

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
    private readonly authService: AuthService,
    private readonly webviewAuthService: WebviewAuthService,
    private readonly draftBuilderService: DraftBuilderService,
    private readonly creditNoteService: CreditNoteService,
    @Inject(PURCHASES_CLIENT) private readonly purchasesClient: PurchasesClient,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<InboundMessageJobDto>): Promise<void> {
    const { phoneNumber, type, text, mediaId, fileName, whatsappMessageId } =
      job.data;
    this.logger.log(`processing ${type} message, job ${job.id}`);
    await this.whatsappClient.markAsRead(whatsappMessageId);

    // "cerrar sesión" runs before the auth gate and independent of it —
    // always the exact same confirmation whether or not the phone was
    // authenticated, never NOT_AUTHENTICATED_REPLY/login-CTA. No LLM cost.
    if (type === InboundMessageType.TEXT && isLogoutCommand(text)) {
      await this.handleLogoutCommand(phoneNumber, job.id);
      return;
    }

    // Auth gate runs before anything else — no STT/classification/LLM cost is
    // spent while the phone isn't authenticated. See project-info.md's
    // "Conversation flow" / "Auth model".
    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      await this.handleUnauthenticated(phoneNumber, type, text, job.id);
      return;
    }

    const outcome = await this.buildReply(
      phoneNumber,
      type,
      text,
      mediaId,
      fileName,
      job.id,
    );

    if (outcome.kind === 'text') {
      await this.sendOrLogTerminal(job.id, () =>
        this.whatsappClient.sendTextMessage(phoneNumber, outcome.text),
      );
    }
  }

  private async handleUnauthenticated(
    phoneNumber: string,
    type: InboundMessageType,
    text: string | undefined,
    jobId: string | number | undefined,
  ): Promise<void> {
    if (
      type === InboundMessageType.TEXT &&
      (isLoginCommand(text) ||
        (text && matchManageInventoryCommand(normalize(text))))
    ) {
      const code = await this.webviewAuthService.mintLoginCode(phoneNumber);
      const webviewBaseUrl = this.config.getOrThrow<string>('WEBVIEW_BASE_URL');
      await this.sendOrLogTerminal(jobId, () =>
        this.whatsappClient.sendCtaMessage(
          phoneNumber,
          LOGIN_CTA_BODY,
          LOGIN_CTA_BUTTON,
          `${webviewBaseUrl}/login?code=${code}`,
        ),
      );
      return;
    }

    await this.sendOrLogTerminal(jobId, () =>
      this.whatsappClient.sendTextMessage(phoneNumber, NOT_AUTHENTICATED_REPLY),
    );
  }

  // manage_inventory intent from an authenticated phone: one CTA message, no
  // LLM call (rule-matched, see classification/domain/rules.ts), not part of
  // the invoice 2-message budget (this isn't a billing interaction).
  private async handleManageInventoryCommand(
    phoneNumber: string,
    jobId: string | number | undefined,
  ): Promise<void> {
    const code = await this.webviewAuthService.mintInventoryCode(phoneNumber);
    const webviewBaseUrl = this.config.getOrThrow<string>('WEBVIEW_BASE_URL');
    await this.sendOrLogTerminal(jobId, () =>
      this.whatsappClient.sendCtaMessage(
        phoneNumber,
        INVENTORY_CTA_BODY,
        INVENTORY_CTA_BUTTON,
        `${webviewBaseUrl}/inventory?code=${code}`,
      ),
    );
  }

  // "cerrar sesión": always the same confirmation, one plain text message,
  // no CTA, no LLM. Clears both the Core API token cache and any in-flight
  // conversation state so stale mid-billing-flow state doesn't survive a
  // logout. Purely local Redis cleanup — never calls the Core API.
  private async handleLogoutCommand(
    phoneNumber: string,
    jobId: string | number | undefined,
  ): Promise<void> {
    await this.authService.logout(phoneNumber);
    await this.conversationStateService.reset(phoneNumber);
    await this.sendOrLogTerminal(jobId, () =>
      this.whatsappClient.sendTextMessage(phoneNumber, LOGOUT_SUCCESS_REPLY),
    );
  }

  private async sendOrLogTerminal(
    jobId: string | number | undefined,
    send: () => Promise<void>,
  ): Promise<void> {
    try {
      await send();
    } catch (error) {
      if (error instanceof TerminalWhatsappError) {
        this.logger.error(
          `terminal send failure on job ${jobId}: ${error.message}`,
        );
        return;
      }
      throw error;
    }
  }

  private async buildReply(
    phoneNumber: string,
    type: InboundMessageType,
    text: string | undefined,
    mediaId: string | undefined,
    fileName: string | undefined,
    jobId: string | number | undefined,
  ): Promise<ReplyOutcome> {
    switch (type) {
      case InboundMessageType.TEXT:
        return this.buildClassifiedReply(phoneNumber, text as string, jobId);
      case InboundMessageType.AUDIO:
        return this.buildAudioReply(phoneNumber, mediaId as string, jobId);
      case InboundMessageType.DOCUMENT:
        return this.buildPurchaseReply(
          phoneNumber,
          mediaId as string,
          fileName,
          jobId,
        );
      case InboundMessageType.UNSUPPORTED:
        return { kind: 'text', text: UNSUPPORTED_REPLY };
    }
  }

  // Gate: classification only runs when the conversation is idle. If the
  // user is mid-billing-flow, skip straight past classification.
  private async buildClassifiedReply(
    phoneNumber: string,
    text: string,
    jobId: string | number | undefined,
  ): Promise<ReplyOutcome> {
    const record = await this.conversationStateService.getState(phoneNumber);
    if (record.state !== 'idle') {
      return {
        kind: 'text',
        text: `Ya estamos procesando una solicitud, por favor termina de gestionar el mensaje anterior.`,
      };
    }

    const { category } = await this.classificationService.classify(text);
    switch (category) {
      case 'greeting':
        return { kind: 'text', text: GREETING_REPLY };
      case 'info_request':
        return { kind: 'text', text: INFO_REQUEST_REPLY };
      case 'billing_attempt':
        await this.handleBillingAttempt(phoneNumber, text, jobId);
        return { kind: 'handled' };
      case 'credit_note_request':
        await this.handleCreditNoteRequest(phoneNumber, text, jobId);
        return { kind: 'handled' };
      case 'manage_inventory':
        await this.handleManageInventoryCommand(phoneNumber, jobId);
        return { kind: 'handled' };
      case 'out_of_context':
        return { kind: 'text', text: OUT_OF_CONTEXT_REPLY };
    }
  }

  // Billing attempts get exactly one message: a CTA linking to the
  // confirmation webview (success), or a hardcoded failure text (no CTA).
  // Never both, never a separate "processing" message — the 2-message/bundle
  // rules (project-info.md constraints #2-3) apply per invoice interaction,
  // and this is message 1 of 2.
  private async handleBillingAttempt(
    phoneNumber: string,
    text: string,
    jobId: string | number | undefined,
  ): Promise<void> {
    try {
      const extracted = await this.llmClient.extract(text);
      const { correlationId } = await this.draftBuilderService.buildDraft(
        phoneNumber,
        extracted,
      );
      const code = await this.webviewAuthService.mintExchangeCode(
        phoneNumber,
        correlationId,
      );
      const webviewBaseUrl = this.config.getOrThrow<string>('WEBVIEW_BASE_URL');
      await this.sendOrLogTerminal(jobId, () =>
        this.whatsappClient.sendCtaMessage(
          phoneNumber,
          DRAFT_CTA_BODY,
          DRAFT_CTA_BUTTON,
          `${webviewBaseUrl}/draft?code=${code}`,
        ),
      );
    } catch (error) {
      if (error instanceof UnresolvedCatalogItemsError) {
        this.logger.warn(
          `billing attempt for job ${jobId} has unresolved catalog items: ${error.missingTerms.join(', ')}`,
        );
        await this.sendOrLogTerminal(jobId, () =>
          this.whatsappClient.sendTextMessage(
            phoneNumber,
            UNRESOLVED_PRODUCTS_REPLY(error.missingTerms),
          ),
        );
        return;
      }
      if (
        error instanceof ExtractionParseError ||
        error instanceof TerminalCoreApiError
      ) {
        this.logger.error(
          `billing attempt failed for job ${jobId}: ${error.message}`,
        );
        await this.sendOrLogTerminal(jobId, () =>
          this.whatsappClient.sendTextMessage(
            phoneNumber,
            BILLING_FAILURE_REPLY,
          ),
        );
        return;
      }
      throw error; // RetryableCoreApiError / unexpected — propagate so BullMQ retries the whole job
    }
  }

  // Credit-note requests get exactly one message too: a CTA linking to the
  // invoice/item-selection webview (success), or a hardcoded failure text (no
  // CTA). Unlike billing, no LLM call is involved — the customer id is pulled
  // via the same regex the classifier used to detect the intent.
  private async handleCreditNoteRequest(
    phoneNumber: string,
    text: string,
    jobId: string | number | undefined,
  ): Promise<void> {
    const identificacion = extractIdNumber(normalize(text));
    if (!identificacion) {
      this.logger.error(
        `credit-note request for job ${jobId} matched intent but no id number extracted`,
      );
      await this.sendOrLogTerminal(jobId, () =>
        this.whatsappClient.sendTextMessage(
          phoneNumber,
          CREDIT_NOTE_NO_ID_REPLY,
        ),
      );
      return;
    }

    try {
      const { correlationId, hasCandidates } =
        await this.creditNoteService.requestByIdentificacion(
          phoneNumber,
          identificacion,
        );

      if (!hasCandidates) {
        await this.sendOrLogTerminal(jobId, () =>
          this.whatsappClient.sendTextMessage(
            phoneNumber,
            CREDIT_NOTE_NO_INVOICES_REPLY,
          ),
        );
        return;
      }

      const code = await this.webviewAuthService.mintExchangeCode(
        phoneNumber,
        correlationId,
      );
      const webviewBaseUrl = this.config.getOrThrow<string>('WEBVIEW_BASE_URL');
      await this.sendOrLogTerminal(jobId, () =>
        this.whatsappClient.sendCtaMessage(
          phoneNumber,
          CREDIT_NOTE_CTA_BODY,
          CREDIT_NOTE_CTA_BUTTON,
          `${webviewBaseUrl}/credit-note?code=${code}`,
        ),
      );
    } catch (error) {
      if (error instanceof TerminalCoreApiError) {
        this.logger.error(
          `credit-note request failed for job ${jobId}: ${error.message}`,
        );
        await this.sendOrLogTerminal(jobId, () =>
          this.whatsappClient.sendTextMessage(
            phoneNumber,
            CREDIT_NOTE_FAILURE_REPLY,
          ),
        );
        return;
      }
      throw error; // RetryableCoreApiError / unexpected — propagate so BullMQ retries the whole job
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
  ): Promise<ReplyOutcome> {
    try {
      const { buffer } = await this.whatsappClient.downloadMedia(mediaId);
      const transcript = await this.sttClient.transcribe(buffer);
      if (!transcript) {
        this.logger.warn(`empty transcript for job ${jobId}`);
        return { kind: 'text', text: STT_FAILURE_REPLY };
      }
      return this.buildClassifiedReply(phoneNumber, transcript, jobId);
    } catch (error) {
      if (
        error instanceof TerminalWhatsappError ||
        error instanceof TerminalSttError
      ) {
        this.logger.error(
          `terminal audio-processing failure on job ${jobId}: ${error.message}`,
        );
        return { kind: 'text', text: STT_FAILURE_REPLY };
      }
      throw error; // RetryableWhatsappError / RetryableSttError — let BullMQ retry
    }
  }

  // Purchases: doc in, result out — no CTA, no webview, no conversation-state
  // involvement (any inbound document is treated as a purchase-XML attempt
  // directly, not gated by classification/state). Exactly one reply.
  private async buildPurchaseReply(
    phoneNumber: string,
    mediaId: string,
    fileName: string | undefined,
    jobId: string | number | undefined,
  ): Promise<ReplyOutcome> {
    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      this.logger.error(
        `purchase document for job ${jobId} arrived without a valid token after the auth gate`,
      );
      return { kind: 'text', text: PURCHASE_FAILURE_REPLY };
    }

    try {
      const { buffer, mimeType } =
        await this.whatsappClient.downloadMedia(mediaId);

      const looksLikeXml =
        mimeType.toLowerCase().includes('xml') ||
        (fileName?.toLowerCase().endsWith('.xml') ?? false);
      if (!looksLikeXml) {
        return { kind: 'text', text: PURCHASE_INVALID_FILE_REPLY };
      }

      const response = await this.purchasesClient.registrarXml(
        token,
        buffer.toString('utf-8'),
      );
      return { kind: 'text', text: PURCHASE_SUCCESS_REPLY(response) };
    } catch (error) {
      if (
        error instanceof TerminalWhatsappError ||
        error instanceof TerminalCoreApiError
      ) {
        this.logger.error(
          `purchase registration failed for job ${jobId}: ${error.message}`,
        );
        return { kind: 'text', text: PURCHASE_FAILURE_REPLY };
      }
      throw error; // RetryableWhatsappError / RetryableCoreApiError — let BullMQ retry
    }
  }
}
