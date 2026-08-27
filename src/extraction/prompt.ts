export const extractionPromptTemplate = (text: string) => {
  return `
  Eres un experto extrayendo información de mensajes de texto.
  Tu tarea es extraer la información del mensaje de texto y devolverla en un formato JSON.
  No devuelvas ninguna explicacion ni texto adicional, solo el JSON.

  Texto: 
  ${text}

  Debes extraer la siguiente información:
  -Nombre del producto: ejemplo: "pan integral", "leche", "huevos"
  -Precio Unitario: ejemplo: "10.5", "20.0", "5.5" 
  -Cantidad (número): ejemplo: "1", "2", "3" 
  -Total (si viene dentro del mensaje, sino calcular en base a precio y cantidad, si no se puede calcular poner "null"): ejemplo: "10.5", "20.0", "5.5"
  -Identificación Cliente: ejemplo: "123456789"
  -Razón Social (si no viene dentro del mensaje, poner "null"): ejemplo: "Juan Lopez"
  -Teléfono Cliente (si no viene dentro del mensaje, poner "null"): ejemplo: "123456789"
  -Dirección Cliente (si no viene dentro del mensaje, poner "null"): ejemplo: "Calle Falsa 123"
  -Correo Cliente (si no viene dentro del mensaje, poner "null"): ejemplo: "[EMAIL_ADDRESS]"

  Devuelve solo el JSON con el siguiente formato:
  {
    "products": [
      {
        "producto": "",
        "precioUnitario": "",
        "cantidad": ""
      }
    ],
    "customerInfo": {
      "identificacion": "",
      "razonSocial": "",
      "telefono": "",
      "direccion": "",
      "email": ""
    },
    "totalFactura": ""
  }
  `;
};
