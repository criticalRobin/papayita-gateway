# Papayita 🥭

**Facturación electrónica para Ecuador, directo desde WhatsApp.**

> Si facturar con los sistemas tradicionales es un dolor de cabeza, con Papayita facturar es "papayita" — súper fácil. El nombre es amigable a propósito: le quita la seriedad aburrida (y a veces intimidante) al mundo de los impuestos y la facturación electrónica, que es justo la barrera que más aleja a los negocios pequeños de cumplir con el SRI.

## El problema

En Ecuador, muchísimos negocios pequeños y emprendedores no facturan electrónicamente, no porque no quieran cumplir, sino porque:

- No tienen una computadora ni acceso cómodo a un ERP o sistema de facturación.
- No quieren pagar una suscripción mensual a un SaaS de facturación.
- No se sienten cómodos usando software — pero sí usan WhatsApp todos los días.

Mientras tanto, las exigencias del SRI van en aumento (transmisión en tiempo real, registro obligatorio de proveedores de facturación electrónica), lo que hace que este problema sea cada vez más urgente para ese segmento.

## La solución

Papayita le permite a cualquier negocio facturar enviando un mensaje de texto o un audio por WhatsApp, tal como describiría la venta a otra persona:

> *"Factura la venta de 1 coca cola de 1 litro por 2 dólares al cliente con cédula 1850137918"*

Por detrás, Papayita transcribe el audio (si aplica), extrae los datos de la venta, resuelve los productos contra el catálogo del negocio, arma el comprobante electrónico, lo firma, lo envía al SRI para autorización, y le devuelve al usuario el PDF de la factura autorizada — todo sin salir de WhatsApp.

## Cómo está construido

Papayita es la capa de cara al cliente que se conecta a un motor de facturación electrónica. Papayita no reconstruye la integración con el SRI desde cero — la reutiliza, y se enfoca exclusivamente en hacer que ese motor sea accesible para alguien que solo sabe usar WhatsApp.

```
Usuario (WhatsApp) → Papayita (WhatsApp Gateway) → Core API (SRI, firma, PDF)
```

### Componentes principales

| Componente | Responsabilidad |
|---|---|
| **Webhook + cola (RabbitMQ/Redis)** | Recibe los mensajes de WhatsApp, deduplica por id de mensaje, encola el procesamiento |
| **Transcripción + extracción (STT + LLM)** | Convierte audio a texto y extrae los datos de la venta en JSON estructurado |
| **Resolución de catálogo** | Busca cada producto mencionado contra el catálogo del emisor; pide al usuario que elija cuando hay ambigüedad |
| **Estado de conversación (Redis)** | Mantiene el contexto de la conversación (borrador pendiente, estado, id de correlación) entre el mensaje inicial y la respuesta asíncrona del Core API |
| **Cliente de Core API** | Llama al motor de facturación existente para crear el comprobante, firmar el XML y enviarlo al SRI |
| **Entrega de resultado** | Recibe el webhook de autorización y entrega el PDF (o un error en lenguaje simple) por WhatsApp |

## Alcance del MVP

**Incluido:**
- Registro de un nuevo emisor vía WhatsApp Flow + certificado `.p12` como adjunto
- Emisión de facturas (documento tipo 01) a partir de texto o audio
- Resolución de productos contra el catálogo del emisor, incluyendo desambiguación cuando hay varias coincidencias
- Validación de precios mencionados contra el catálogo (por ítem o como total de la venta)
- Confirmación obligatoria antes de emitir, con ciclo de corrección
- Entrega del PDF autorizado o de un error en lenguaje claro

**Fuera de alcance por ahora:**
- Notas de crédito/débito, guías de remisión, comprobantes de retención
- Autoservicio completo para obtener el certificado digital (por ahora, soporte humano)
- Cobro a nuestros propios clientes
- Integraciones B2B2C (plataformas de delivery, cooperativas) — fase futura

## Por qué WhatsApp y no una app o una web

El público objetivo de Papayita ya vive en WhatsApp. Pedirle que instale una app, cree una cuenta en una web, o llene un formulario fuera del chat reintroduce exactamente la fricción que este producto busca eliminar. Por eso:

- El registro usa un **WhatsApp Flow** (formulario nativo dentro del chat), no un sitio externo.
- El certificado `.p12` se envía como un adjunto normal de WhatsApp.
- Toda la conversación — desde la venta hasta la entrega del PDF — ocurre en un solo hilo de chat.

---

*Papayita — porque facturar con el SRI no debería sentirse como hacer un trámite.*