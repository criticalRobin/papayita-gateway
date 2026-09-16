import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AuthService } from '../../auth/auth.service';
import { ConversationStateService } from '../../conversation-state/conversation-state.service';
import { CoreApiWebhookDto } from '../../core-api/webhook/dto/core-api-webhook.dto';
import { EmissionTimeoutJobDto } from '../../invoice-emission/dto/emission-timeout-job.dto';
import { formatRejectionMessage } from '../../invoice-emission/domain/format-rejection-message';
import { INVOICE_EMISSION_CLIENT } from '../../invoice-emission/invoice-emission.module';
import type { InvoiceEmissionClient } from '../../invoice-emission/invoice-emission-client.interface';
import { PendingEmissionStore } from '../../invoice-emission/pending-emission.store';
import { WHATSAPP_CLIENT } from '../../whatsapp/client/whatsapp.module';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import { maskTail } from '../../common/redact';

// SRI tipoComprobante codes this processor cares about — '01' factura, '04' nota de
// crédito. Both share the same comprobante.autorizado/rechazado webhook events and the
// same generic RIDE endpoint, so one processor handles both; only wording/filename differ.
const TIPO_COMPROBANTE_NOTA_CREDITO = '04';

function documentLabel(tipoComprobante: string | undefined): string {
  return tipoComprobante === TIPO_COMPROBANTE_NOTA_CREDITO
    ? 'nota de crédito'
    : 'factura';
}

function filenamePrefix(tipoComprobante: string | undefined): string {
  return tipoComprobante === TIPO_COMPROBANTE_NOTA_CREDITO
    ? 'nota-credito'
    : 'factura';
}

function escalationReply(tipoComprobante: string | undefined): string {
  return `No pudimos completar el envío de tu ${documentLabel(tipoComprobante)} por un problema técnico. Contacta al negocio para revisar tu pedido.`;
}

// concurrency: 1 — same ordering-safety rationale as the WhatsApp inbound processor;
// revisit only if this becomes a real bottleneck.
@Processor('invoice-emission-events', { concurrency: 1 })
export class InvoiceEmissionProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceEmissionProcessor.name);

  constructor(
    @Inject(INVOICE_EMISSION_CLIENT)
    private readonly invoiceEmissionClient: InvoiceEmissionClient,
    @Inject(WHATSAPP_CLIENT) private readonly whatsappClient: WhatsappClient,
    private readonly pendingEmissionStore: PendingEmissionStore,
    private readonly conversationStateService: ConversationStateService,
    private readonly authService: AuthService,
  ) {
    super();
  }

  async process(
    job: Job<CoreApiWebhookDto | EmissionTimeoutJobDto>,
  ): Promise<void> {
    if (job.name === 'emission-timeout') {
      return this.processTimeout(job as Job<EmissionTimeoutJobDto>);
    }

    const { evento, payload } = (job as Job<CoreApiWebhookDto>).data;
    const pending = await this.pendingEmissionStore.get(payload.emisorId);

    if (!pending) {
      this.logger.warn(
        `no pending emission for emisorId=${maskTail(payload.emisorId)}, dropping ${evento}`,
      );
      return;
    }

    if (evento === 'comprobante.autorizado') {
      await this.handleAutorizado(
        pending.phoneNumber,
        payload.claveAcceso as string,
        payload.tipoComprobante,
      );
    } else if (evento === 'comprobante.rechazado') {
      await this.handleRechazado(
        pending.phoneNumber,
        payload.mensajes ?? [],
        payload.tipoComprobante,
      );
    } else {
      this.logger.log(`ignoring unhandled evento ${evento} in processor`);
      return;
    }

    await this.pendingEmissionStore.clear(payload.emisorId);
    await this.conversationStateService.applyEvent(pending.phoneNumber, {
      type: 'WEBHOOK_RECEIVED',
    });
  }

  private async handleAutorizado(
    phoneNumber: string,
    claveAcceso: string,
    tipoComprobante: string | undefined,
  ): Promise<void> {
    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      throw new Error(
        `no valid Core API token for ${maskTail(phoneNumber)} while fetching RIDE`,
      );
    }

    const pdf = await this.invoiceEmissionClient.getRide(token, claveAcceso);
    const filename = `${filenamePrefix(tipoComprobante)}-${claveAcceso}.pdf`;
    const mediaId = await this.whatsappClient.uploadMedia(
      pdf,
      'application/pdf',
      filename,
    );
    await this.whatsappClient.sendDocumentMessage(
      phoneNumber,
      mediaId,
      filename,
    );
  }

  private async handleRechazado(
    phoneNumber: string,
    mensajes: { identificador: string; mensaje: string; tipo: string }[],
    tipoComprobante: string | undefined,
  ): Promise<void> {
    const message = formatRejectionMessage(
      mensajes,
      documentLabel(tipoComprobante),
    );
    await this.whatsappClient.sendTextMessage(phoneNumber, message);
  }

  // Fires when no comprobante.autorizado/rechazado webhook ever arrived for an
  // emission — the pending record set right after emitir() is still there
  // untouched, meaning nothing cleared it in the meantime. Reuses the same
  // escalationReply wording as the retries-exhausted path below: from the
  // user's perspective both are "we couldn't confirm your document."
  private async processTimeout(job: Job<EmissionTimeoutJobDto>): Promise<void> {
    const { emisorId, phoneNumber, correlationId, tipoComprobante } = job.data;
    const pending = await this.pendingEmissionStore.get(emisorId);
    if (!pending || pending.correlationId !== correlationId) {
      // Webhook already arrived and cleared it, or a newer emission for the
      // same emisorId superseded this one — see PendingEmissionStore's
      // known emisorId-only limitation.
      return;
    }

    this.logger.error(
      `emission confirmation timed out for emisorId=${maskTail(emisorId)}, correlationId=${correlationId} — no SRI webhook arrived`,
    );

    try {
      await this.whatsappClient.sendTextMessage(
        phoneNumber,
        escalationReply(tipoComprobante),
      );
    } catch (error) {
      this.logger.error(
        `timeout escalation message also failed for ${maskTail(phoneNumber)}: ${error}`,
      );
    } finally {
      await this.pendingEmissionStore.clear(emisorId);
      await this.conversationStateService.applyEvent(phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
    }
  }

  // Best-effort escalation: once retries are exhausted, make sure the customer isn't left
  // hanging silently (message-budget rules still require exactly one result message).
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<CoreApiWebhookDto | EmissionTimeoutJobDto>,
  ): Promise<void> {
    if (job.name === 'emission-timeout') {
      // processTimeout() already sends its own escalation/cleanup in a
      // try/finally regardless of outcome — nothing extra to do if the job
      // itself still fails (e.g. Redis unreachable).
      return;
    }
    const webhookJob = job as Job<CoreApiWebhookDto>;

    const attempts = webhookJob.opts.attempts ?? 1;
    if (webhookJob.attemptsMade < attempts) {
      return;
    }

    const pending = await this.pendingEmissionStore.get(
      webhookJob.data.payload.emisorId,
    );
    if (!pending) {
      return;
    }

    try {
      await this.whatsappClient.sendTextMessage(
        pending.phoneNumber,
        escalationReply(webhookJob.data.payload.tipoComprobante),
      );
    } catch (error) {
      this.logger.error(
        `escalation message also failed for ${maskTail(pending.phoneNumber)}: ${error}`,
      );
    } finally {
      await this.pendingEmissionStore.clear(webhookJob.data.payload.emisorId);
      await this.conversationStateService.applyEvent(pending.phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
    }
  }
}
