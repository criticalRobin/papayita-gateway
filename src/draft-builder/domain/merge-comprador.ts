import { PersonaRecord } from '../../persona/persona-lookup.interface';
import { CompradorDraft } from './types';

export interface ExtractedComprador {
  tipoIdentificacion: string | null;
  identificacion: string | null;
  razonSocial: string | null;
}

// Digit-count decides cédula vs RUC — code decides, never the LLM.
// 10 digits = cédula ("05"), 13 digits = RUC ("04"), anything else = unknown.
export function deriveTipoIdentificacion(
  identificacion: string | null,
): '04' | '05' | null {
  if (!identificacion) return null;
  const digits = identificacion.replace(/\D/g, '');
  if (digits.length === 13) return '04';
  if (digits.length === 10) return '05';
  return null;
}

// persona found  -> persona's fields win outright (SRI-backed, authoritative)
// persona null   -> LLM's guessed fields kept, tipoIdentificacion re-derived
//                    from digit-count (never trust the LLM's own guess for this)
export function mergeComprador(
  extracted: ExtractedComprador,
  persona: PersonaRecord | null,
): CompradorDraft {
  if (persona) {
    return {
      tipoIdentificacion: deriveTipoIdentificacion(persona.identificacion),
      identificacion: persona.identificacion,
      razonSocial: persona.razonSocial,
      direccion: persona.direccion,
      telefono: persona.telefono,
      email: persona.email,
      verified: true,
    };
  }

  return {
    tipoIdentificacion: deriveTipoIdentificacion(extracted.identificacion),
    identificacion: extracted.identificacion,
    razonSocial: extracted.razonSocial,
    direccion: null,
    telefono: null,
    email: null,
    verified: false,
  };
}
