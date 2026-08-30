import { Inject, Injectable } from '@nestjs/common';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { EmisorClient, EmisorProfile } from './emisor-client.interface';

interface RawEmisorApiResponse {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionMatriz: string;
  obligadoContabilidad: boolean;
  contribuyenteEspecial: string;
  agenteRetencion: string;
  contribuyenteRimpe: boolean;
  ambiente: string;
  estado: string;
  tenantId: string;
  whatsapp: string;
  tieneCertificado: boolean;
  certificadoValidoHasta: string | null;
  certificadoSujeto: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class EmisorService implements EmisorClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
  ) {}

  async getProfile(
    token: CoreApiUserToken,
    emisorId: string,
  ): Promise<EmisorProfile> {
    const raw = await this.coreApiClient.get<RawEmisorApiResponse>(
      `/emisores/${emisorId}`,
      token,
    );

    return {
      ruc: raw.ruc,
      razonSocial: raw.razonSocial,
      nombreComercial: raw.nombreComercial,
      dirMatriz: raw.direccionMatriz,
      establecimiento: '001',
      puntoEmision: '001',
      obligadoContabilidad: raw.obligadoContabilidad ? 'SI' : 'NO',
      contribuyenteEspecial: raw.contribuyenteEspecial || null,
      agenteRetencion: raw.agenteRetencion || null,
      contribuyenteRimpe: raw.contribuyenteRimpe
        ? 'CONTRIBUYENTE RÉGIMEN RIMPE'
        : null,
    };
  }
}
