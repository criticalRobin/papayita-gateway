import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AuthService } from '../../auth/auth.service';
import { ConversationStateService } from '../../conversation-state/conversation-state.service';
import { CoreApiWebhookDto } from '../../core-api/webhook/dto/core-api-webhook.dto';
import { formatRejectionMessage } from '../../invoice-emission/domain/format-rejection-message';
import { INVOICE_EMISSION_CLIENT } from '../../invoice-emission/invoice-emission.module';
import type { InvoiceEmissionClient } from '../../invoice-emission/invoice-emission-client.interface';
import { PendingEmissionStore } from '../../invoice-emission/pending-emission.store';
import { WHATSAPP_CLIENT } from '../../whatsapp/client/whatsapp.module';
import type { WhatsappClient } from '../../whatsapp/client/whatsapp-client.interface';
import { maskTail } from '../../common/redact';

const ESCALATION_REPLY =
  'No pudimos completar el envío de tu factura por un problema técnico. Contacta al negocio para revisar tu pedido.';

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

  async process(job: Job<CoreApiWebhookDto>): Promise<void> {
    const { evento, payload } = job.data;
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
      );
    } else if (evento === 'comprobante.rechazado') {
      await this.handleRechazado(pending.phoneNumber, payload.mensajes ?? []);
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
  ): Promise<void> {
    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      throw new Error(
        `no valid Core API token for ${maskTail(phoneNumber)} while fetching RIDE`,
      );
    }

    const pdf = await this.invoiceEmissionClient.getRide(token, claveAcceso);
    const filename = `factura-${claveAcceso}.pdf`;
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
  ): Promise<void> {
    const message = formatRejectionMessage(mensajes);
    await this.whatsappClient.sendTextMessage(phoneNumber, message);
  }

  // Best-effort escalation: once retries are exhausted, make sure the customer isn't left
  // hanging silently (message-budget rules still require exactly one result message).
  @OnWorkerEvent('failed')
  async onFailed(job: Job<CoreApiWebhookDto>): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    const pending = await this.pendingEmissionStore.get(
      job.data.payload.emisorId,
    );
    if (!pending) {
      return;
    }

    try {
      await this.whatsappClient.sendTextMessage(
        pending.phoneNumber,
        ESCALATION_REPLY,
      );
    } catch (error) {
      this.logger.error(
        `escalation message also failed for ${maskTail(pending.phoneNumber)}: ${error}`,
      );
    } finally {
      await this.pendingEmissionStore.clear(job.data.payload.emisorId);
      await this.conversationStateService.applyEvent(pending.phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
    }
  }
}
