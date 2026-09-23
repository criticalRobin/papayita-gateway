import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { AuthService } from '../auth/auth.service';
import type { EmisorClient } from '../emisor/emisor-client.interface';
import type { PersonaLookupClient } from '../persona/persona-lookup.interface';
import { PersonaNotFoundError } from '../persona/persona.errors';
import type { ConversationStateService } from '../conversation-state/conversation-state.service';
import type { PendingEmissionStore } from '../invoice-emission/pending-emission.store';
import type { EmissionWatchdogService } from '../invoice-emission/emission-watchdog.service';
import type { WebviewAuthService } from '../webview-auth/webview-auth.service';
import { CreditNoteService } from './credit-note.service';
import type { CreditNoteClient } from './credit-note-client.interface';
import { CreditNoteCandidatesDocument } from './domain/types';
import { ConfirmCreditNoteDto } from './dto/confirm-credit-note.dto';

// Loose mock shapes, not Partial<RealService> — see draft-builder.service.spec.ts
// for why (@typescript-eslint/unbound-method on real-class method references).
interface MockOverrides {
  authService?: { getValidToken?: jest.Mock; getEmisorId?: jest.Mock };
  emisorClient?: { getProfile?: jest.Mock };
  personaClient?: { findByIdentificacion?: jest.Mock };
  creditNoteClient?: {
    listComprobantes?: jest.Mock;
    getComprobanteXml?: jest.Mock;
    emitir?: jest.Mock;
  };
  pendingEmissionStore?: { set?: jest.Mock };
  emissionWatchdogService?: { scheduleTimeout?: jest.Mock };
  conversationStateService?: {
    applyEvent?: jest.Mock;
    getPendingDocument?: jest.Mock;
  };
  webviewAuthService?: { killExchangeCodeForCorrelation?: jest.Mock };
}

const token = 'access-1';
const emisorId = 'emisor-1';
const phoneNumber = '5219999999999';
const correlationId = 'corr-1';
const claveAcceso = '1609202601185013791800110010010000000499131334912';

const candidatesDocument: CreditNoteCandidatesDocument = {
  kind: 'credit_note_candidates',
  rucEmisor: '1850137918001',
  identificacionComprador: '1850137918',
  candidatos: [
    {
      claveAcceso,
      fechaEmision: '12/09/2026',
      secuencial: '000000025',
      razonSocialComprador: 'TITE HARO RAMIRO MATIAS',
      identificacionComprador: '1850137918',
      subtotal: 500,
      total: 575,
      estado: 'AUTORIZADO',
    },
  ],
};

// One detalle at cantidad 5, matches the fixture in build-final-credit-note.spec.ts.
const comprobanteXml = `<factura>
  <infoTributaria>
    <ambiente>1</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>MATIAS TITE</razonSocial>
    <nombreComercial>NUKAY SW</nombreComercial>
    <ruc>1850137918001</ruc>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>000000025</secuencial>
    <dirMatriz>PILLARO</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>12/09/2026</fechaEmision>
    <obligadoContabilidad>NO</obligadoContabilidad>
    <tipoIdentificacionComprador>05</tipoIdentificacionComprador>
    <razonSocialComprador>TITE HARO RAMIRO MATIAS</razonSocialComprador>
    <identificacionComprador>1850137918</identificacionComprador>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>CONS-PS5-01</codigoPrincipal>
      <codigoAuxiliar>SONY-001</codigoAuxiliar>
      <descripcion>Consola Sony PlayStation 5</descripcion>
      <cantidad>5</cantidad>
      <precioUnitario>100</precioUnitario>
      <descuento>10</descuento>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>4</codigoPorcentaje>
          <tarifa>15</tarifa>
          <baseImponible>490</baseImponible>
          <valor>73.5</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>
</factura>`;

function makeDto(
  overrides: Partial<ConfirmCreditNoteDto> = {},
): ConfirmCreditNoteDto {
  return {
    claveAcceso,
    selectedItems: [{ index: 0, cantidad: 5 }],
    motivo: 'Devolución de consola',
    ...overrides,
  };
}

function makeService(overrides: MockOverrides = {}) {
  const authService = {
    getValidToken: jest.fn().mockResolvedValue(token),
    getEmisorId: jest.fn().mockResolvedValue(emisorId),
    ...overrides.authService,
  } as unknown as AuthService;
  const emisorClient = {
    getProfile: jest.fn(),
    ...overrides.emisorClient,
  } as unknown as EmisorClient;
  const personaClient = {
    findByIdentificacion: jest
      .fn()
      .mockRejectedValue(new PersonaNotFoundError('not found')),
    ...overrides.personaClient,
  } as unknown as PersonaLookupClient;
  const emitir =
    overrides.creditNoteClient?.emitir ??
    jest
      .fn()
      .mockResolvedValue({ mensaje: 'ok', jobId: 'job-1', estado: 'EN_COLA' });
  const creditNoteClient = {
    listComprobantes: jest.fn(),
    getComprobanteXml: jest.fn().mockResolvedValue(Buffer.from(comprobanteXml)),
    ...overrides.creditNoteClient,
    emitir,
  } as unknown as CreditNoteClient;
  const pendingEmissionStore = {
    set: jest.fn().mockResolvedValue(undefined),
    ...overrides.pendingEmissionStore,
  } as unknown as PendingEmissionStore;
  const emissionWatchdogService = {
    scheduleTimeout: jest.fn().mockResolvedValue(undefined),
    ...overrides.emissionWatchdogService,
  } as unknown as EmissionWatchdogService;
  const conversationStateService = {
    applyEvent: jest.fn().mockResolvedValue(undefined),
    getPendingDocument: jest.fn().mockResolvedValue(candidatesDocument),
    ...overrides.conversationStateService,
  } as unknown as ConversationStateService;
  const webviewAuthService = {
    killExchangeCodeForCorrelation: jest.fn().mockResolvedValue(undefined),
    ...overrides.webviewAuthService,
  };

  const service = new CreditNoteService(
    authService,
    emisorClient,
    personaClient,
    creditNoteClient,
    pendingEmissionStore,
    emissionWatchdogService,
    conversationStateService,
    webviewAuthService as unknown as WebviewAuthService,
  );

  return { service, emitir, conversationStateService, webviewAuthService };
}

describe('CreditNoteService.confirmAndSubmit', () => {
  it('scales the selected detalle to the requested partial cantidad before submitting', async () => {
    const { service, emitir } = makeService();

    await service.confirmAndSubmit(
      phoneNumber,
      correlationId,
      makeDto({ selectedItems: [{ index: 0, cantidad: 2 }] }),
    );

    expect(emitir).toHaveBeenCalledWith(
      token,
      expect.objectContaining({
        detalles: [
          expect.objectContaining({
            cantidad: 2,
            descuento: 4, // 10 * (2/5)
            impuestos: [
              expect.objectContaining({ baseImponible: 196, valor: 29.4 }),
            ],
          }),
        ],
      }),
    );
  });

  it('submits the original figures unchanged when the full cantidad is selected', async () => {
    const { service, emitir, webviewAuthService } = makeService();

    await service.confirmAndSubmit(phoneNumber, correlationId, makeDto());

    expect(emitir).toHaveBeenCalledWith(
      token,
      expect.objectContaining({
        detalles: [
          expect.objectContaining({
            cantidad: 5,
            descuento: 10,
            impuestos: [
              expect.objectContaining({ baseImponible: 490, valor: 73.5 }),
            ],
          }),
        ],
      }),
    );
    expect(
      webviewAuthService.killExchangeCodeForCorrelation,
    ).toHaveBeenCalledWith(correlationId);
  });

  it('rejects a cantidad greater than the original invoiced quantity', async () => {
    const { service, emitir } = makeService();

    await expect(
      service.confirmAndSubmit(
        phoneNumber,
        correlationId,
        makeDto({ selectedItems: [{ index: 0, cantidad: 6 }] }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(emitir).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range index', async () => {
    const { service, emitir } = makeService();

    await expect(
      service.confirmAndSubmit(
        phoneNumber,
        correlationId,
        makeDto({ selectedItems: [{ index: 5, cantidad: 1 }] }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(emitir).not.toHaveBeenCalled();
  });

  it('throws when the phone has no valid Core API token', async () => {
    const { service } = makeService({
      authService: {
        getValidToken: jest.fn().mockResolvedValue(null),
        getEmisorId: jest.fn().mockResolvedValue(emisorId),
      },
    });

    await expect(
      service.confirmAndSubmit(phoneNumber, correlationId, makeDto()),
    ).rejects.toThrow(UnauthorizedException);
  });
});
