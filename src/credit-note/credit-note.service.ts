import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { EMISOR_CLIENT } from '../emisor/emisor.module';
import type { EmisorClient } from '../emisor/emisor-client.interface';
import { PERSONA_LOOKUP_CLIENT } from '../persona/persona.module';
import type { PersonaLookupClient } from '../persona/persona-lookup.interface';
import { ConversationStateService } from '../conversation-state/conversation-state.service';
import { PendingEmissionStore } from '../invoice-emission/pending-emission.store';
import { EmissionWatchdogService } from '../invoice-emission/emission-watchdog.service';
import { formatFechaEmision } from '../common/format-date';
import { CREDIT_NOTE_CLIENT } from './credit-note-client.interface';
import type { CreditNoteClient } from './credit-note-client.interface';
import { buildFinalCreditNote } from './domain/build-final-credit-note';
import { parseComprobanteXml } from './domain/parse-comprobante-xml';
import { scaleDetalleForCantidad } from './domain/scale-detalle';
import {
  ComprobanteSummary,
  CreditNoteCandidatesDocument,
  CreditNoteXmlData,
} from './domain/types';
import { ConfirmCreditNoteDto } from './dto/confirm-credit-note.dto';

const INVALID_LINK_MESSAGE =
  'Este enlace ya no es válido, pídele a tu negocio que envíe la solicitud de nuevo.';

@Injectable()
export class CreditNoteService {
  constructor(
    private readonly authService: AuthService,
    @Inject(EMISOR_CLIENT) private readonly emisorClient: EmisorClient,
    @Inject(PERSONA_LOOKUP_CLIENT)
    private readonly personaClient: PersonaLookupClient,
    @Inject(CREDIT_NOTE_CLIENT)
    private readonly creditNoteClient: CreditNoteClient,
    private readonly pendingEmissionStore: PendingEmissionStore,
    private readonly emissionWatchdogService: EmissionWatchdogService,
    private readonly conversationStateService: ConversationStateService,
  ) {}

  async requestByIdentificacion(
    phoneNumber: string,
    identificacionComprador: string,
  ): Promise<{ correlationId: string; hasCandidates: boolean }> {
    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      throw new UnauthorizedException('not authenticated');
    }
    const emisorId = await this.authService.getEmisorId(phoneNumber);
    if (!emisorId) {
      throw new UnauthorizedException('not authenticated');
    }

    const { ruc: rucEmisor } = await this.emisorClient.getProfile(
      token,
      emisorId,
    );

    const candidatos = await this.creditNoteClient.listComprobantes(token, {
      rucEmisor,
      identificacionComprador,
    });

    if (candidatos.length === 0) {
      return { correlationId: '', hasCandidates: false };
    }

    const correlationId = randomUUID();
    const document: CreditNoteCandidatesDocument = {
      kind: 'credit_note_candidates',
      rucEmisor,
      identificacionComprador,
      candidatos,
    };
    await this.conversationStateService.applyEvent(phoneNumber, {
      type: 'DRAFT_READY',
      correlationId,
      draft: document,
    });

    return { correlationId, hasCandidates: true };
  }

  async getCandidates(
    phoneNumber: string,
    correlationId: string,
  ): Promise<ComprobanteSummary[]> {
    const document = await this.getCandidatesDocument(
      phoneNumber,
      correlationId,
    );
    return document.candidatos;
  }

  async getDraftForClaveAcceso(
    phoneNumber: string,
    correlationId: string,
    claveAcceso: string,
  ): Promise<CreditNoteXmlData> {
    const document = await this.getCandidatesDocument(
      phoneNumber,
      correlationId,
    );
    this.assertOfferedCandidate(document, claveAcceso);

    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      throw new UnauthorizedException(
        'Tu sesión con el negocio expiró, pídele que envíe la solicitud de nuevo.',
      );
    }

    return this.fetchAndEnrichXmlData(token, claveAcceso);
  }

  async confirmAndSubmit(
    phoneNumber: string,
    correlationId: string,
    dto: ConfirmCreditNoteDto,
  ): Promise<void> {
    const document = await this.getCandidatesDocument(
      phoneNumber,
      correlationId,
    );
    this.assertOfferedCandidate(document, dto.claveAcceso);

    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      throw new UnauthorizedException(
        'Tu sesión con el negocio expiró, pídele que envíe la solicitud de nuevo.',
      );
    }
    const emisorId = await this.authService.getEmisorId(phoneNumber);
    if (!emisorId) {
      throw new UnauthorizedException(
        'Tu sesión con el negocio expiró, pídele que envíe la solicitud de nuevo.',
      );
    }

    // Re-fetched fresh, never trusted from the webview or from the cached
    // candidate list — the only source of truth for money fields.
    const data = await this.fetchAndEnrichXmlData(token, dto.claveAcceso);

    // The webview clamps cantidad client-side to the original invoiced
    // quantity, but that's not a security boundary — re-validate against the
    // freshly re-fetched XML before scaling any money field.
    const selectedDetalles = dto.selectedItems.map((item) => {
      const detalle = data.detalles[item.index];
      if (!detalle) {
        throw new BadRequestException(
          `Selección de producto inválida (índice ${item.index}).`,
        );
      }
      if (item.cantidad > detalle.cantidad) {
        throw new BadRequestException(
          `La cantidad solicitada excede la cantidad facturada originalmente (índice ${item.index}).`,
        );
      }
      return scaleDetalleForCantidad(detalle, item.cantidad);
    });

    const finalCreditNote = buildFinalCreditNote(
      data,
      selectedDetalles,
      formatFechaEmision(new Date()),
      {
        motivo: dto.motivo,
        razonSocial: dto.razonSocial,
        comprador: dto.comprador,
      },
    );

    await this.conversationStateService.applyEvent(phoneNumber, {
      type: 'WEBVIEW_CONFIRMED',
    });

    try {
      await this.creditNoteClient.emitir(token, finalCreditNote);
    } catch (error) {
      // Nothing is in flight on Core API's side for a rejected submission —
      // reset instead of leaving the conversation stuck in "submitting".
      await this.conversationStateService.applyEvent(phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
      throw error;
    }

    // Correlates the async comprobante.autorizado/rechazado webhook back to this
    // conversation, same as facturas — InvoiceEmissionProcessor handles both
    // document types off tipoComprobante in the webhook payload. See
    // PendingEmissionStore for the emisorId-only limitation.
    await this.pendingEmissionStore.set(emisorId, {
      phoneNumber,
      correlationId,
    });

    // If SRI/Core API never fires a webhook back (e.g. SRI itself is down),
    // this fires instead so the user isn't left hanging indefinitely.
    await this.emissionWatchdogService.scheduleTimeout({
      emisorId,
      phoneNumber,
      correlationId,
      tipoComprobante: '04',
    });
  }

  private async fetchAndEnrichXmlData(
    token: CoreApiUserToken,
    claveAcceso: string,
  ): Promise<CreditNoteXmlData> {
    const xml = await this.creditNoteClient.getComprobanteXml(
      token,
      claveAcceso,
    );
    const data = parseComprobanteXml(xml.toString('utf-8'));

    const persona = await this.personaClient.findByIdentificacion(
      token,
      data.comprador.identificacion,
    );
    if (persona) {
      data.comprador.direccion = persona.direccion;
      data.comprador.telefono = persona.telefono;
      data.comprador.email = persona.email;
    }

    return data;
  }

  private async getCandidatesDocument(
    phoneNumber: string,
    correlationId: string,
  ): Promise<CreditNoteCandidatesDocument> {
    const pendingDocument =
      await this.conversationStateService.getPendingDocument(
        phoneNumber,
        correlationId,
      );
    if (
      !pendingDocument ||
      (pendingDocument as CreditNoteCandidatesDocument).kind !==
        'credit_note_candidates'
    ) {
      throw new NotFoundException(INVALID_LINK_MESSAGE);
    }
    return pendingDocument as CreditNoteCandidatesDocument;
  }

  private assertOfferedCandidate(
    document: CreditNoteCandidatesDocument,
    claveAcceso: string,
  ): void {
    const isOffered = document.candidatos.some(
      (c) => c.claveAcceso === claveAcceso,
    );
    if (!isOffered) {
      throw new BadRequestException(
        'Ese comprobante no está entre las opciones disponibles para esta solicitud.',
      );
    }
  }
}
