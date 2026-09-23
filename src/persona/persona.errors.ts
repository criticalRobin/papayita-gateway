// Thrown by PersonaService.findByIdentificacion() when Core API answers 404.
// `message` is Core API's own plain-language text (e.g. "La persona con
// identificación ... no existe en el SRI ...") so it can be relayed to the
// user as-is; a generic fallback is used if the body didn't carry one.
export class PersonaNotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}
