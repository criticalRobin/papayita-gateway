export const extractionPromptTemplate = (text: string) => {
  return `Extrae datos de facturación del texto. Responde solo JSON, sin explicación, con este formato exacto (usa null si un campo no viene en el texto):
{"comprador":{"tipoIdentificacion":null,"identificacion":null,"razonSocial":null},"items":[{"idCliente":"item-1","textoConsulta":"","cantidad":1,"precioMencionado":null}],"precioTotalMencionado":null,"formaPagoMencionada":null}

Reglas:
- tipoIdentificacion: "04" si dice RUC, "05" si dice cédula, si no null.
- items: uno por producto mencionado. idCliente secuencial ("item-1","item-2"...). textoConsulta = como lo describió el cliente (para buscarlo en catálogo). cantidad = entero mencionado o 1 si no se menciona.
- formaPagoMencionada: ej. "efectivo","tarjeta".

Texto: ${text}`;
};
