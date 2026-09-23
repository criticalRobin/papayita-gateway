import type { CoreApiUserToken } from '../core-api/core-api-token';

export interface PersonaRecord {
  id: string;
  tipoIdentificacion: string;
  identificacion: string;
  razonSocial: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  // Remaining SRI-metadata fields (estadoContribuyente, regimen, categoriaRimpe,
  // etc.) intentionally not modeled — draft-builder never consumes them.
}

export interface PersonaLookupClient {
  // GET /personas/buscar/{identificacion} — 10 digits is cédula, 13 is RUC
  // (caller decides which, never the LLM). Throws PersonaNotFoundError on a
  // 404, carrying Core API's user-facing message.
  findByIdentificacion(
    token: CoreApiUserToken,
    identificacion: string,
  ): Promise<PersonaRecord>;
}
