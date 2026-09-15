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
import { WHATSAPP_CLIENT } from '../whatsapp/client/whatsapp.module';
import type { WhatsappClient } from '../whatsapp/client/whatsapp-client.interface';
import { formatFechaEmision } from '../common/format-date';
import { CREDIT_NOTE_CLIENT } from './credit-note-client.interface';
import type { CreditNoteClient } from './credit-note-client.interface';
import { buildFinalCreditNote } from './domain/build-final-credit-note';
import { parseComprobanteXml } from './domain/parse-comprobante-xml';
import {
  ComprobanteSummary,
  CreditNoteCandidatesDocument,
  CreditNoteXmlData,
} from './domain/types';
import { ConfirmCreditNoteDto } from './dto/confirm-credit-note.dto';

const INVALID_LINK_MESSAGE =
  'Este enlace ya no es válido, pídele a tu negocio que envíe la solicitud de nuevo.';
const CREDIT_NOTE_QUEUED_REPLY =
  'Tu nota de crédito fue enviada al SRI para su emisión.';

@Injectable()
export class CreditNoteService {
  constructor(
    private readonly authService: AuthService,
    @Inject(EMISOR_CLIENT) private readonly emisorClient: EmisorClient,
    @Inject(PERSONA_LOOKUP_CLIENT)
    private readonly personaClient: PersonaLookupClient,
    @Inject(CREDIT_NOTE_CLIENT)
    private readonly creditNoteClient: CreditNoteClient,
    @Inject(WHATSAPP_CLIENT) private readonly whatsappClient: WhatsappClient,
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

    // Re-fetched fresh, never trusted from the webview or from the cached
    // candidate list — the only source of truth for money fields.
    const data = await this.fetchAndEnrichXmlData(token, dto.claveAcceso);

    const selectedDetalles = dto.selectedIndexes.map((index) => {
      const detalle = data.detalles[index];
      if (!detalle) {
        throw new BadRequestException(
          `Selección de producto inválida (índice ${index}).`,
        );
      }
      return detalle;
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

    // No webhook exists for credit notes (unlike facturas) — the "done"
    // signal is synchronous, right here, not deferred to a queue processor.
    await this.conversationStateService.applyEvent(phoneNumber, {
      type: 'WEBHOOK_RECEIVED',
    });

    // The one result message for this interaction (message 2 of 2).
    await this.whatsappClient.sendTextMessage(
      phoneNumber,
      CREDIT_NOTE_QUEUED_REPLY,
    );
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
