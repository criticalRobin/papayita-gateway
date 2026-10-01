import type { ExtractedBillingAttempt } from './domain/types';

export const extractionPromptTemplate = (text: string) => {
  return `Extrae datos de facturación del texto. Responde solo JSON, sin explicación, con este formato exacto (usa null si un campo no viene en el texto):
{"comprador":{"tipoIdentificacion":null,"identificacion":null},"items":[{"idCliente":"item-1","textoConsulta":"","cantidad":1}]}

Reglas:
- tipoIdentificacion: "04" si dice RUC, "05" si dice cédula, si no null.
- Si piden factura a "consumidor final", pon identificacion: "9999999999999" y tipoIdentificacion: "07".
- items: uno por producto mencionado. idCliente secuencial ("item-1","item-2"...). textoConsulta = como lo describió el cliente (para buscarlo en catálogo). cantidad = entero mencionado o 1 si no se menciona.

Texto: ${text}`;
};

// Billing correction window follow-up: the previous extraction plus the
// problems code found with it (cédula/RUC not in SRI, product not in
// catalog) and every message so far. The LLM only patches the JSON — code
// re-runs buildDraft() afterwards to decide whether it's actually fixed.
export const refinementPromptTemplate = (
  previous: ExtractedBillingAttempt,
  problemas: string[],
  messages: string[],
): string => {
  const historial = messages
    .map((message, index) =>
      index === 0
        ? `Mensaje original: ${message}`
        : `Corrección ${index}: ${message}`,
    )
    .join('\n');

  return `Corrige los datos de facturación extraídos con la información de las correcciones del cliente. Responde solo JSON, sin explicación, con el mismo formato exacto:
{"comprador":{"tipoIdentificacion":null,"identificacion":null},"items":[{"idCliente":"item-1","textoConsulta":"","cantidad":1}]}

Datos actuales: ${JSON.stringify(previous)}

Problemas encontrados:
${problemas.map((problema) => `- ${problema}`).join('\n')}

Reglas:
- Aplica solo lo que el cliente corrige; conserva todo lo demás igual.
- Conserva los idCliente existentes. Si el cliente renombra un producto, cambia solo su textoConsulta.
- Si el cliente agrega o quita productos, o cambia cantidades, refléjalo en items.
- tipoIdentificacion: "04" si dice RUC, "05" si dice cédula, si no null.
- Si pide factura a "consumidor final", pon identificacion: "9999999999999" y tipoIdentificacion: "07".
- Si el mensaje no aporta ninguna corrección (ej. "listo", "ya lo agregué"), devuelve los datos actuales sin cambios.

${historial}`;
};
