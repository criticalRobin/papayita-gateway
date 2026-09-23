import { Inject, Injectable } from '@nestjs/common';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { TerminalCoreApiError } from '../core-api/core-api.errors';
import { PersonaLookupClient, PersonaRecord } from './persona-lookup.interface';
import { PersonaNotFoundError } from './persona.errors';

const PERSONA_NOT_FOUND_FALLBACK =
  'No se encontro información del cliente, por favor intenta nuevamente con su número de cédula.';

@Injectable()
export class PersonaService implements PersonaLookupClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
  ) {}

  async findByIdentificacion(
    token: CoreApiUserToken,
    identificacion: string,
  ): Promise<PersonaRecord> {
    try {
      return await this.coreApiClient.get<PersonaRecord>(
        `/personas/buscar/${identificacion}`,
        token,
      );
    } catch (error) {
      if (error instanceof TerminalCoreApiError && error.status === 404) {
        throw new PersonaNotFoundError(
          error.coreApiMessage ?? PERSONA_NOT_FOUND_FALLBACK,
        );
      }
      throw error;
    }
  }
}
