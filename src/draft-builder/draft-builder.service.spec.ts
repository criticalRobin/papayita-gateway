import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthService } from '../auth/auth.service';
import type { ConversationStateService } from '../conversation-state/conversation-state.service';
import type { PendingEmissionStore } from '../invoice-emission/pending-emission.store';
import type { EmissionWatchdogService } from '../invoice-emission/emission-watchdog.service';
import type { WebviewAuthService } from '../webview-auth/webview-auth.service';
import type { PlanGateService } from '../plan-gate/plan-gate.service';
import { PlanGateBlockedError } from '../plan-gate/plan-gate.errors';
import type { ConfigService } from '@nestjs/config';
import { DraftBuilderService } from './draft-builder.service';
import { UnresolvedCatalogItemsError } from './domain/errors';
import { FormaPago } from './domain/types';

// Loose mock shapes (not Partial<RealService>) — referencing a real class's
// method as a value (even inside Partial<>) trips
// @typescript-eslint/unbound-method, since these are plain jest.fn doubles
// with no `this` binding to worry about.
interface MockOverrides {
  authService?: { getValidToken?: jest.Mock; getEmisorId?: jest.Mock };
  catalogClient?: { searchBatch?: jest.Mock; getDetalles?: jest.Mock };
  personaClient?: { findByIdentificacion?: jest.Mock };
  emisorClient?: { getProfile?: jest.Mock };
  invoiceEmissionClient?: { emitir?: jest.Mock; getRide?: jest.Mock };
  pendingEmissionStore?: {
    set?: jest.Mock;
    get?: jest.Mock;
    clear?: jest.Mock;
  };
  conversationStateService?: {
    applyEvent?: jest.Mock;
    getState?: jest.Mock;
    getPendingDocument?: jest.Mock;
  };
  emissionWatchdogService?: { scheduleTimeout?: jest.Mock };
  webviewAuthService?: { killExchangeCodeForCorrelation?: jest.Mock };
  planGateService?: { assertBillingAllowed?: jest.Mock };
  config?: { getOrThrow?: jest.Mock };
}

const token = 'access-1';
const emisorId = '8e741a58-96c0-4d16-ba1b-b4ec8219c28e';

const emisorProfile = {
  ruc: '1850137918001',
  razonSocial: 'Matias Tite',
  nombreComercial: 'Nukay SW',
  dirMatriz: 'Pillaro',
  establecimiento: '001',
  puntoEmision: '001',
  obligadoContabilidad: 'SI',
  contribuyenteEspecial: null,
  agenteRetencion: null,
  contribuyenteRimpe: 'CONTRIBUYENTE RÉGIMEN RIMPE',
};

function makeService(overrides: MockOverrides = {}) {
  const authService = {
    getValidToken: jest.fn().mockResolvedValue(token),
    getEmisorId: jest.fn().mockResolvedValue(emisorId),
    ...overrides.authService,
  } as unknown as AuthService;
  const catalogClient = {
    searchBatch: jest.fn().mockResolvedValue([]),
    getDetalles: jest.fn().mockResolvedValue([]),
    ...overrides.catalogClient,
  };
  const personaClient = {
    findByIdentificacion: jest.fn().mockResolvedValue(null),
    ...overrides.personaClient,
  };
  const emisorClient = {
    getProfile: jest.fn().mockResolvedValue(emisorProfile),
    ...overrides.emisorClient,
  };
  const invoiceEmissionClient = {
    emitir: jest
      .fn()
      .mockResolvedValue({ mensaje: 'ok', jobId: 'job-1', estado: 'EN_COLA' }),
    getRide: jest.fn().mockResolvedValue(Buffer.from('')),
    ...overrides.invoiceEmissionClient,
  };
  const pendingEmissionStore = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
    ...overrides.pendingEmissionStore,
  };
  const applyEvent =
    overrides.conversationStateService?.applyEvent ??
    jest.fn().mockResolvedValue(undefined);
  const getState = overrides.conversationStateService?.getState ?? jest.fn();
  // Mirrors the real ConversationStateService.getPendingDocument logic on top
  // of whatever getState mock the test supplied, so existing tests that only
  // override getState keep working unchanged.
  const getPendingDocument =
    overrides.conversationStateService?.getPendingDocument ??
    jest.fn(async (phoneNumber: string, correlationId: string) => {
      const record = (await getState(phoneNumber)) as {
        correlationId: string | null;
        state: string;
        pendingDocument: unknown;
      } | null;
      if (
        !record ||
        record.correlationId !== correlationId ||
        record.state !== 'awaiting_webview_action'
      ) {
        return null;
      }
      return record.pendingDocument;
    });
  const conversationStateService = {
    applyEvent,
    getState,
    getPendingDocument,
    ...overrides.conversationStateService,
  } as unknown as ConversationStateService;
  const emissionWatchdogService = {
    scheduleTimeout: jest.fn().mockResolvedValue(undefined),
    ...overrides.emissionWatchdogService,
  };
  const webviewAuthService = {
    killExchangeCodeForCorrelation: jest.fn().mockResolvedValue(undefined),
    ...overrides.webviewAuthService,
  };
  const planGateService = {
    assertBillingAllowed: jest.fn().mockResolvedValue(undefined),
    ...overrides.planGateService,
  } as unknown as PlanGateService;
  const config = {
    getOrThrow: jest.fn((key: string) => (key === 'SRI_AMBIENTE' ? '1' : '1')),
    ...overrides.config,
  } as unknown as ConfigService;

  const service = new DraftBuilderService(
    authService,
    catalogClient,
    personaClient,
    emisorClient,
    invoiceEmissionClient,
    pendingEmissionStore as unknown as PendingEmissionStore,
    emissionWatchdogService as unknown as EmissionWatchdogService,
    conversationStateService,
    webviewAuthService as unknown as WebviewAuthService,
    planGateService,
    config,
  );

  return {
    service,
    authService,
    catalogClient,
    personaClient,
    emisorClient,
    invoiceEmissionClient,
    pendingEmissionStore,
    emissionWatchdogService,
    conversationStateService,
    webviewAuthService,
    planGateService,
    applyEvent,
    config,
  };
}

const extracted = {
  comprador: {
    tipoIdentificacion: null,
    identificacion: '1850137918',
    razonSocial: 'Matias Tite',
  },
  items: [
    {
      idCliente: 'item-1',
      textoConsulta: 'play station 5',
      cantidad: 1,
      precioMencionado: null,
    },
  ],
  precioTotalMencionado: null,
  formaPagoMencionada: null,
};

const ps5Candidate = {
  id: 'c5948014-f491-4eb0-923d-52e03b0413a6',
  codigoPrincipal: 'CONS-PS5-01',
  codigoAuxiliar: 'SONY-001',
  nombre: 'Consola PlayStation 5 Edición Digital',
  descripcion: 'desc',
  unidadMedida: 'Unidad',
  precioUnitario: 499.99,
  impuestoId: null,
};

const ps5ProductoDetalle = {
  codigoPrincipal: 'CONS-PS5-01',
  codigoAuxiliar: 'SONY-001',
  descripcion: 'Consola Sony PlayStation 5',
  unidadMedida: 'Unidad',
  cantidad: 1,
  precioUnitario: 499.99,
  descuento: 0,
  impuestos: [
    {
      codigo: '2',
      codigoPorcentaje: '4',
      tarifa: 15,
      baseImponible: 499.99,
      valor: 75,
    },
  ],
};

describe('DraftBuilderService', () => {
  describe('buildDraft', () => {
    it('assembles the draft, merges comprador, resolves catalog candidates, and stores DRAFT_READY', async () => {
      const { service, catalogClient, applyEvent } = makeService({
        catalogClient: {
          searchBatch: jest
            .fn()
            .mockResolvedValue([
              { termino: 'play station 5', productos: [ps5Candidate] },
            ]),
        },
      });

      const { correlationId, draft } = await service.buildDraft(
        '+593993908744',
        extracted,
      );

      expect(catalogClient.searchBatch).toHaveBeenCalledWith(token, {
        emisorId,
        whatsapp: '+593993908744',
        terminos: ['play station 5'],
      });
      expect(draft.items[0].resolutionStatus).toBe('auto_selected');
      expect(draft.items[0].selectedCandidateId).toBe(ps5Candidate.id);
      expect(applyEvent).toHaveBeenCalledWith(
        '+593993908744',
        expect.objectContaining({ type: 'DRAFT_READY', correlationId }),
      );
    });

    it('throws UnauthorizedException if the token is missing', async () => {
      const { service } = makeService({
        authService: { getValidToken: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.buildDraft('+593993908744', extracted),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnresolvedCatalogItemsError and does not store DRAFT_READY when a term has zero catalog candidates', async () => {
      const { service, applyEvent } = makeService({
        catalogClient: {
          searchBatch: jest
            .fn()
            .mockResolvedValue([{ termino: 'play station 5', productos: [] }]),
        },
      });

      const error = await service
        .buildDraft('+593993908744', extracted)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnresolvedCatalogItemsError);
      expect((error as UnresolvedCatalogItemsError).missingTerms).toEqual([
        'play station 5',
      ]);
      expect(applyEvent).not.toHaveBeenCalled();
    });
  });

  describe('getDraft', () => {
    it('throws NotFoundException on a correlationId mismatch', async () => {
      const { service } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue({
            state: 'awaiting_webview_action',
            correlationId: 'corr-actual',
            pendingDocument: {},
            updatedAt: '',
          }),
        },
      });

      await expect(
        service.getDraft('+593993908744', 'corr-requested'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the state is not awaiting_webview_action', async () => {
      const { service } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue({
            state: 'idle',
            correlationId: 'corr-1',
            pendingDocument: null,
            updatedAt: '',
          }),
        },
      });

      await expect(service.getDraft('+593993908744', 'corr-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmAndSubmit', () => {
    const draft = {
      correlationId: 'corr-1',
      comprador: {
        tipoIdentificacion: '05' as const,
        identificacion: '1850137918',
        razonSocial: 'TITE HARO RAMIRO MATIAS',
        direccion: null,
        telefono: null,
        email: null,
        verified: true,
      },
      items: [
        {
          idCliente: 'item-1',
          textoConsulta: 'play station 5',
          resolutionStatus: 'auto_selected' as const,
          candidates: [ps5Candidate],
          selectedCandidateId: ps5Candidate.id,
          detalle: {
            codigoPrincipal: ps5Candidate.codigoPrincipal,
            codigoAuxiliar: ps5Candidate.codigoAuxiliar,
            descripcion: ps5Candidate.nombre,
            unidadMedida: ps5Candidate.unidadMedida,
            cantidad: 1,
            precioUnitario: ps5Candidate.precioUnitario,
            descuento: 0,
          },
        },
      ],
      precioTotalMencionado: null,
      formaPagoMencionada: null,
    };

    function draftState() {
      return {
        state: 'awaiting_webview_action' as const,
        correlationId: 'corr-1',
        pendingDocument: draft,
        updatedAt: '',
      };
    }

    it('rejects when a confirmed item has no selectedCandidateId', async () => {
      const { service } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
      });

      await expect(
        service.confirmAndSubmit('+593993908744', 'corr-1', {
          comprador: {},
          detalles: [{ idCliente: 'item-1', cantidad: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when Core API rejects the productoId (invalid selection)', async () => {
      const { service } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
        catalogClient: {
          // Core API returned fewer detalles than requested items.
          getDetalles: jest.fn().mockResolvedValue([]),
        },
      });

      await expect(
        service.confirmAndSubmit('+593993908744', 'corr-1', {
          comprador: {},
          detalles: [
            {
              idCliente: 'item-1',
              selectedCandidateId: ps5Candidate.id,
              cantidad: 1,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when the emisorId is missing (never logged in)', async () => {
      const { service } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
        authService: {
          getValidToken: jest.fn().mockResolvedValue(token),
          getEmisorId: jest.fn().mockResolvedValue(null),
        },
      });

      await expect(
        service.confirmAndSubmit('+593993908744', 'corr-1', {
          comprador: {},
          detalles: [
            {
              idCliente: 'item-1',
              selectedCandidateId: ps5Candidate.id,
              cantidad: 1,
            },
          ],
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ConflictException and never calls Core API when the plan gate re-check blocks the submission', async () => {
      const { service, catalogClient, invoiceEmissionClient } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
        planGateService: {
          assertBillingAllowed: jest
            .fn()
            .mockRejectedValue(
              new PlanGateBlockedError('PLAN_LIMIT', 'Límite alcanzado.'),
            ),
        },
      });

      await expect(
        service.confirmAndSubmit('+593993908744', 'corr-1', {
          comprador: {},
          detalles: [
            {
              idCliente: 'item-1',
              selectedCandidateId: ps5Candidate.id,
              cantidad: 1,
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);

      expect(catalogClient.getDetalles).not.toHaveBeenCalled();
      expect(invoiceEmissionClient.emitir).not.toHaveBeenCalled();
    });

    it('assembles the invoice from /inventario/productos/detalles (with impuestos), emits it to Core API, and stores the pending emission instead of resolving synchronously', async () => {
      const {
        service,
        applyEvent,
        catalogClient,
        invoiceEmissionClient,
        pendingEmissionStore,
        emissionWatchdogService,
        emisorClient,
        webviewAuthService,
      } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
        catalogClient: {
          getDetalles: jest.fn().mockResolvedValue([ps5ProductoDetalle]),
        },
      });

      const invoice = await service.confirmAndSubmit(
        '+593993908744',
        'corr-1',
        {
          comprador: { email: 'matiastite1@gmail.com' },
          detalles: [
            {
              idCliente: 'item-1',
              selectedCandidateId: ps5Candidate.id,
              cantidad: 1,
            },
          ],
          formaPago: FormaPago.EFECTIVO,
        },
      );

      expect(catalogClient.getDetalles).toHaveBeenCalledWith(token, {
        emisorId,
        whatsapp: '+593993908744',
        items: [{ productoId: ps5Candidate.id, cantidad: 1, descuento: 0 }],
      });
      expect(emisorClient.getProfile).toHaveBeenCalledWith(token, emisorId);
      expect(invoice).not.toHaveProperty('secuencial');
      expect(invoice.detalles[0].impuestos).toEqual(
        ps5ProductoDetalle.impuestos,
      );
      expect(invoice.comprador.email).toBe('matiastite1@gmail.com');
      expect(invoiceEmissionClient.emitir).toHaveBeenCalledWith(token, invoice);
      expect(pendingEmissionStore.set).toHaveBeenCalledWith(emisorId, {
        phoneNumber: '+593993908744',
        correlationId: 'corr-1',
      });
      expect(emissionWatchdogService.scheduleTimeout).toHaveBeenCalledWith({
        emisorId,
        phoneNumber: '+593993908744',
        correlationId: 'corr-1',
        tipoComprobante: '01',
      });
      expect(applyEvent).toHaveBeenCalledWith('+593993908744', {
        type: 'WEBVIEW_CONFIRMED',
      });
      // Waiting on Core API's async webhook now — must NOT reset to idle here.
      expect(applyEvent).not.toHaveBeenCalledWith('+593993908744', {
        type: 'WEBHOOK_RECEIVED',
      });
      expect(
        webviewAuthService.killExchangeCodeForCorrelation,
      ).toHaveBeenCalledWith('corr-1');
    });

    it('resets the conversation to idle and rethrows when Core API rejects the emission', async () => {
      const emitError = new Error('Core API call rejected (status 400)');
      const {
        service,
        applyEvent,
        pendingEmissionStore,
        emissionWatchdogService,
      } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
        catalogClient: {
          getDetalles: jest.fn().mockResolvedValue([ps5ProductoDetalle]),
        },
        invoiceEmissionClient: {
          emitir: jest.fn().mockRejectedValue(emitError),
        },
      });

      await expect(
        service.confirmAndSubmit('+593993908744', 'corr-1', {
          comprador: {},
          detalles: [
            {
              idCliente: 'item-1',
              selectedCandidateId: ps5Candidate.id,
              cantidad: 1,
            },
          ],
        }),
      ).rejects.toThrow(emitError);

      expect(pendingEmissionStore.set).not.toHaveBeenCalled();
      expect(emissionWatchdogService.scheduleTimeout).not.toHaveBeenCalled();
      expect(applyEvent).toHaveBeenCalledWith('+593993908744', {
        type: 'WEBHOOK_RECEIVED',
      });
    });

    it('sends precioModificado to Core API when the user manually edited the price', async () => {
      const modifiedProductoDetalle = {
        ...ps5ProductoDetalle,
        precioUnitario: 480,
      };
      const { service, catalogClient } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
        catalogClient: {
          getDetalles: jest.fn().mockResolvedValue([modifiedProductoDetalle]),
        },
      });

      const invoice = await service.confirmAndSubmit(
        '+593993908744',
        'corr-1',
        {
          comprador: {},
          detalles: [
            {
              idCliente: 'item-1',
              selectedCandidateId: ps5Candidate.id,
              cantidad: 1,
              precioUnitarioOverride: 480,
            },
          ],
        },
      );

      expect(catalogClient.getDetalles).toHaveBeenCalledWith(token, {
        emisorId,
        whatsapp: '+593993908744',
        items: [
          {
            productoId: ps5Candidate.id,
            cantidad: 1,
            descuento: 0,
            precioModificado: 480,
          },
        ],
      });
      expect(invoice.detalles[0].precioUnitario).toBe(480);
    });

    it('sends a user-supplied descuento to Core API', async () => {
      const { service, catalogClient } = makeService({
        conversationStateService: {
          getState: jest.fn().mockResolvedValue(draftState()),
        },
        catalogClient: {
          getDetalles: jest.fn().mockResolvedValue([ps5ProductoDetalle]),
        },
      });

      await service.confirmAndSubmit('+593993908744', 'corr-1', {
        comprador: {},
        detalles: [
          {
            idCliente: 'item-1',
            selectedCandidateId: ps5Candidate.id,
            cantidad: 1,
            descuento: 10,
          },
        ],
      });

      expect(catalogClient.getDetalles).toHaveBeenCalledWith(token, {
        emisorId,
        whatsapp: '+593993908744',
        items: [
          {
            productoId: ps5Candidate.id,
            cantidad: 1,
            descuento: 10,
          },
        ],
      });
    });
  });
});
