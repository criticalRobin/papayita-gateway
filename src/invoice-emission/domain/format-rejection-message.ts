export interface RechazoMensaje {
  identificador: string;
  mensaje: string;
  informacionAdicional?: string;
  tipo: string;
}

export function formatRejectionMessage(
  mensajes: RechazoMensaje[],
  documentLabel = 'factura',
): string {
  const primary =
    mensajes.find((mensaje) => mensaje.tipo === 'ERROR') ?? mensajes[0];
  const detail = primary?.mensaje ?? 'motivo desconocido';
  return `No pudimos emitir tu ${documentLabel}: ${detail}. Verifica los datos e inténtalo de nuevo.`;
}
