import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { CATALOG_SEARCH_CLIENT } from '../catalog/catalog.module';
import type {
  CatalogSearchClient,
  CatalogSearchResultGroup,
} from '../catalog/catalog-search.interface';
import { PERSONA_LOOKUP_CLIENT } from '../persona/persona.module';
import type {
  PersonaLookupClient,
  PersonaRecord,
} from '../persona/persona-lookup.interface';
import { EMISOR_CLIENT } from '../emisor/emisor.module';
import type { EmisorClient } from '../emisor/emisor-client.interface';
import { INVOICE_EMISSION_CLIENT } from '../invoice-emission/invoice-emission.module';
import type { InvoiceEmissionClient } from '../invoice-emission/invoice-emission-client.interface';
import { PendingEmissionStore } from '../invoice-emission/pending-emission.store';
import { EmissionWatchdogService } from '../invoice-emission/emission-watchdog.service';
import { ConversationStateService } from '../conversation-state/conversation-state.service';
import { WebviewAuthService } from '../webview-auth/webview-auth.service';
import { PlanGateService } from '../plan-gate/plan-gate.service';
import { PlanGateBlockedError } from '../plan-gate/plan-gate.errors';
import type { ExtractedBillingAttempt } from '../extraction/domain/types';
import { buildSkeleton } from './domain/build-skeleton';
import {
  deriveTipoIdentificacion,
  mergeComprador,
} from './domain/merge-comprador';
import { resolveCandidates } from './domain/resolve-candidates';
import { mergeCatalogResults } from './domain/merge-catalog-results';
import { mergeProductoDetalles } from './domain/merge-producto-detalles';
import { findUnresolvedItems } from './domain/find-unresolved-items';
import { BillingIssue, IncompleteBillingAttemptError } from './domain/errors';
import { PersonaNotFoundError } from '../persona/persona.errors';
import { assembleInvoice } from './domain/assemble-invoice';
import { CandidateResolution, Draft, FinalInvoice } from './domain/types';
import { ConfirmDraftDto } from './dto/confirm-draft.dto';
import { formatFechaEmision } from '../common/format-date';
import { PostBatchCatalogProductDto } from 'src/catalog/dto/post-batch-catalog.dto';
import { PostProductDetailDto } from 'src/catalog/dto/post-product-detail.dto';

@Injectable()
export class DraftBuilderService {
  private readonly logger = new Logger(DraftBuilderService.name);

  constructor(
    private readonly authService: AuthService,
    @Inject(CATALOG_SEARCH_CLIENT)
    private readonly catalogClient: CatalogSearchClient,
    @Inject(PERSONA_LOOKUP_CLIENT)
    private readonly personaClient: PersonaLookupClient,
    @Inject(EMISOR_CLIENT) private readonly emisorClient: EmisorClient,
    @Inject(INVOICE_EMISSION_CLIENT)
    private readonly invoiceEmissionClient: InvoiceEmissionClient,
    private readonly pendingEmissionStore: PendingEmissionStore,
    private readonly emissionWatchdogService: EmissionWatchdogService,
    private readonly conversationStateService: ConversationStateService,
    private readonly webviewAuthService: WebviewAuthService,
    private readonly planGateService: PlanGateService,
    private readonly config: ConfigService,
  ) {}

  async buildDraft(
    phoneNumber: string,
    extracted: ExtractedBillingAttempt,
  ): Promise<{ correlationId: string; draft: Draft }> {
    const token = await this.authService.getValidToken(phoneNumber);
    const emisorId = await this.authService.getEmisorId(phoneNumber);

    if (!token || !emisorId) {
      throw new UnauthorizedException('not authenticated');
    }

    const tipo = deriveTipoIdentificacion(extracted.comprador.identificacion);

    let persona: PersonaRecord | null = null;
    const issues: BillingIssue[] = [];

    if (tipo === '07') {
      // Consumidor final bypasses lookup — mergeComprador sets defaults
    } else if (tipo && extracted.comprador.identificacion) {
      try {
        persona = await this.personaClient.findByIdentificacion(
          token,
          extracted.comprador.identificacion,
        );
      } catch (error) {
        if (!(error instanceof PersonaNotFoundError)) throw error;
        // Keep going so catalog problems surface in the same reply.
        issues.push({
          kind: 'identificacion_no_encontrada',
          identificacion: extracted.comprador.identificacion,
          detalle: error.message,
        });
      }
    }

    const comprador = mergeComprador(extracted.comprador, persona);

    const terminos = extracted.items.map((item) => item.textoConsulta);

    const batchBody: PostBatchCatalogProductDto = {
      emisorId,
      whatsapp: phoneNumber,
      terminos,
    };

    const searchResults = await this.catalogClient.searchBatch(
      token,
      batchBody,
    );

    const resolutionByIdCliente = this.matchResultsToItems(
      extracted.items,
      searchResults,
    );

    const items = mergeCatalogResults(extracted.items, resolutionByIdCliente);

    // Never send a partial-catalog draft — the webview has nothing to
    // offer for a zero-candidate item, so don't persist DRAFT_READY.
    findUnresolvedItems(items).forEach((item) =>
      issues.push({
        kind: 'producto_no_encontrado',
        termino: item.textoConsulta,
      }),
    );
    if (issues.length > 0) {
      throw new IncompleteBillingAttemptError(issues);
    }

    const correlationId = randomUUID();
    const draft: Draft = {
      correlationId,
      comprador,
      items,
      precioTotalMencionado: null,
      formaPagoMencionada: null,
    };

    await this.conversationStateService.applyEvent(phoneNumber, {
      type: 'DRAFT_READY',
      correlationId,
      draft,
    });

    return { correlationId, draft };
  }

  async getDraft(phoneNumber: string, correlationId: string): Promise<Draft> {
    const pendingDocument =
      await this.conversationStateService.getPendingDocument(
        phoneNumber,
        correlationId,
      );
    if (!pendingDocument) {
      throw new NotFoundException(
        'Este enlace ya no es válido, pídele a tu negocio que envíe la factura de nuevo.',
      );
    }
    return pendingDocument as Draft;
  }

  async confirmAndSubmit(
    phoneNumber: string,
    correlationId: string,
    dto: ConfirmDraftDto,
  ): Promise<FinalInvoice> {
    const draft = await this.getDraft(phoneNumber, correlationId);

    const token = await this.authService.getValidToken(phoneNumber);
    if (!token) {
      throw new UnauthorizedException(
        'Tu sesión con el negocio expiró, pídele que envíe la factura de nuevo.',
      );
    }
    const emisorId = await this.authService.getEmisorId(phoneNumber);
    if (!emisorId) {
      throw new UnauthorizedException(
        'Tu sesión con el negocio expiró, pídele que envíe la factura de nuevo.',
      );
    }

    // Re-checked here (not just at draft-build time) — the webview session
    // can stay open for minutes, during which the monthly comprobante count
    // could tip over. See project-info.md's webview re-validation discipline.
    try {
      await this.planGateService.assertBillingAllowed(phoneNumber);
    } catch (error) {
      if (error instanceof PlanGateBlockedError) {
        throw new ConflictException(
          'No pudimos completar tu factura por una restricción de tu plan. Contáctanos para más información.',
        );
      }
      throw error;
    }

    dto.detalles.forEach((detalle) => {
      if (!detalle.selectedCandidateId) {
        throw new BadRequestException(
          `Falta seleccionar un producto para "${detalle.idCliente}".`,
        );
      }
    });

    const body: PostProductDetailDto = {
      emisorId,
      whatsapp: phoneNumber,
      items: dto.detalles.map((detalle) => ({
        productoId: detalle.selectedCandidateId as string,
        cantidad: detalle.cantidad,
        descuento: detalle.descuento ?? 0,
        ...(detalle.precioUnitarioOverride != null
          ? { precioModificado: detalle.precioUnitarioOverride }
          : {}),
      })),
    };

    const productoDetalles = await this.catalogClient.getDetalles(token, body);

    if (productoDetalles.length !== dto.detalles.length) {
      throw new BadRequestException(
        'No pudimos calcular los datos de facturación para uno o más productos, por favor revisa tu selección.',
      );
    }

    const finalDetalles = mergeProductoDetalles(productoDetalles);

    const finalComprador = {
      tipoIdentificacion: deriveTipoIdentificacion(
        dto.comprador.identificacion ?? draft.comprador.identificacion,
      ),
      identificacion:
        dto.comprador.identificacion ?? draft.comprador.identificacion,
      razonSocial: dto.comprador.razonSocial ?? draft.comprador.razonSocial,
      direccion: dto.comprador.direccion ?? draft.comprador.direccion,
      telefono: dto.comprador.telefono ?? draft.comprador.telefono,
      email: dto.comprador.email ?? draft.comprador.email,
      verified: draft.comprador.verified,
    };

    const emisor = await this.emisorClient.getProfile(token, emisorId);
    const skeleton = buildSkeleton(
      emisor,
      {
        ambiente: this.config.getOrThrow<string>('SRI_AMBIENTE'),
        tipoEmision: this.config.getOrThrow<string>('SRI_TIPO_EMISION'),
      },
      formatFechaEmision(new Date()),
    );

    const invoice = assembleInvoice(
      skeleton,
      finalComprador,
      finalDetalles,
      dto.formaPago,
    );

    await this.conversationStateService.applyEvent(phoneNumber, {
      type: 'WEBVIEW_CONFIRMED',
    });
    // Draft actually confirmed — burn the exchange code so a stale/reopened
    // tab can't replay this CTA link anymore.
    await this.webviewAuthService.killExchangeCodeForCorrelation(correlationId);

    try {
      await this.invoiceEmissionClient.emitir(token, invoice);
    } catch (error) {
      // Core API rejected the submission outright or is unreachable — nothing is in
      // flight there, so reset the conversation instead of leaving it stuck in
      // "submitting" forever. The customer would need to send a new WhatsApp message
      // to try again (no webhook will ever arrive for this attempt).
      await this.conversationStateService.applyEvent(phoneNumber, {
        type: 'WEBHOOK_RECEIVED',
      });
      throw error;
    }

    // Correlates the async comprobante.autorizado/rechazado webhook back to this
    // conversation — see PendingEmissionStore for the emisorId-only limitation.
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
      tipoComprobante: '01',
    });

    return invoice;
  }

  private matchResultsToItems(
    items: { idCliente: string; textoConsulta: string }[],
    results: CatalogSearchResultGroup[],
  ): Map<string, CandidateResolution> {
    const resolutionByIdCliente = new Map<string, CandidateResolution>();

    if (results.length !== items.length) {
      this.logger.warn(
        `catalog search returned ${results.length} groups for ${items.length} terms — falling back to string-match`,
      );
      items.forEach((item) => {
        const group = results.find((r) => r.termino === item.textoConsulta);
        resolutionByIdCliente.set(
          item.idCliente,
          resolveCandidates(group?.productos ?? []),
        );
      });
      return resolutionByIdCliente;
    }

    items.forEach((item, index) => {
      resolutionByIdCliente.set(
        item.idCliente,
        resolveCandidates(results[index]?.productos ?? []),
      );
    });
    return resolutionByIdCliente;
  }
}
