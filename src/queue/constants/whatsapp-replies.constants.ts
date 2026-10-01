import type { PurchaseRegisteredResponse } from '../../purchases/purchases-client.interface';
import type { BillingIssue } from '../../draft-builder/domain/errors';

// Hardcoded, deterministic replies — no LLM call here (project-info.md constraint #5).
export const STT_FAILURE_REPLY =
  'No pudimos entender tu nota de voz, por favor escribe tu mensaje.';
export const UNSUPPORTED_REPLY =
  'No pudimos procesar ese tipo de mensaje, por favor escribe tu mensaje en texto.';
export const GREETING_REPLY =
  '¡Hola! Soy el asistente de facturación. Cuéntame qué necesitas facturar y te ayudo.';
export const INFO_REQUEST_REPLY =
  'Con este servicio puedes emitir tus facturas autorizadas por el SRI directamente por WhatsApp. Cuéntame los datos de la venta cuando quieras facturar.';
export const OUT_OF_CONTEXT_REPLY =
  'No pudimos entender tu mensaje. Si quieres emitir una factura, cuéntame los datos de la venta.';
export const NOT_AUTHENTICATED_REPLY =
  'Actualmente no tienes una sesión activa. Escribe "iniciar sesión" para comenzar.';
export const LOGOUT_SUCCESS_REPLY =
  'Cerraste tu sesión correctamente. Escribe "iniciar sesión" cuando quieras volver a vincular tu cuenta.';
export const LOGOUT_FAILURE_ATTEMPT =
  'Tu sesión actualente esta inactiva, no es necesario cerrar sesión. Si quieres iniciar sesión, escribe "iniciar sesión".  ';
export const LOGIN_ALREADY_AUTHENTICATED_REPLY =
  'Tu cuenta ya está vinculada y lista para facturar.';
export const LOGIN_CTA_BODY =
  'Vincula tu cuenta para emitir facturas por WhatsApp.';
export const LOGIN_CTA_BUTTON = 'Iniciar sesión';
export const DRAFT_CTA_BODY =
  'Ya casi terminamos tu factura. Revisa y confirma los datos aquí:';
export const DRAFT_CTA_BUTTON = 'Ver borrador';
export const BILLING_FAILURE_REPLY =
  'No pudimos procesar tu solicitud de facturación, por favor intenta de nuevo.';
// Billing correction window — one message listing every open problem.
// Still deterministic: issues are structured, so the template can name the
// exact cédula/product without an LLM call.
export const BILLING_ISSUES_REPLY = (
  issues: BillingIssue[],
  remainingAttempts: number,
): string => {
  const lines = issues.map((issue) => {
    switch (issue.kind) {
      case 'identificacion_no_encontrada':
        // Core API's detalle is already plain-language Spanish.
        return `• ${issue.detalle} Envíame la cédula o RUC correcto.`;
      case 'producto_no_encontrado':
        return `• No encontré "${issue.termino}" en tu catálogo. Dime el nombre correcto, o agrégalo con "administrar productos" y luego escribe "listo".`;
    }
  });
  const intentos =
    remainingAttempts === 1
      ? 'Te queda 1 intento'
      : `Te quedan ${remainingAttempts} intentos`;
  return `Para armar tu factura necesito corregir esto:\n${lines.join('\n')}\n\nResponde solo con el dato corregido. ${intentos}. Escribe "cancelar" para empezar de nuevo.`;
};
export const BILLING_FIX_EXHAUSTED_REPLY =
  'No pudimos completar tu factura con las correcciones enviadas. Envíame la solicitud completa de nuevo cuando quieras.';
export const BILLING_CANCELLED_REPLY =
  'Listo, cancelé esa factura. Envíame una nueva solicitud cuando quieras.';
export const INVENTORY_CTA_BODY =
  'Administra tus categorías y productos desde aquí:';
export const INVENTORY_CTA_BUTTON = 'Ver inventario';
export const CREDIT_NOTE_CTA_BODY =
  'Selecciona la factura y los productos para tu nota de crédito aquí:';
export const CREDIT_NOTE_CTA_BUTTON = 'Ver facturas';
export const CREDIT_NOTE_FAILURE_REPLY =
  'No pudimos procesar tu solicitud de nota de crédito, por favor intenta de nuevo.';
export const CREDIT_NOTE_NO_INVOICES_REPLY =
  'No encontramos facturas autorizadas para ese cliente, verifica el número e intenta de nuevo.';
export const CREDIT_NOTE_NO_ID_REPLY =
  'No pudimos identificar el número de cédula/RUC del cliente, por favor incluye el número completo.';
export const PURCHASE_INVALID_FILE_REPLY =
  'Solo aceptamos el archivo XML de la factura de compra, por favor envíalo como documento adjunto.';
export const PURCHASE_FAILURE_REPLY =
  'No pudimos registrar tu compra, por favor verifica el XML e intenta de nuevo.';
export const PURCHASE_SUCCESS_REPLY = (
  response: PurchaseRegisteredResponse,
): string =>
  `Compra registrada: ${response.proveedorRazonSocial}, comprobante ${response.establecimiento}-${response.puntoEmision}-${response.secuencial}, total $${response.importeTotal.toFixed(2)}.`;
export const PLAN_LIMIT_REPLY =
  'Alcanzaste el límite de comprobantes de tu plan este mes. Contáctanos para cambiar de plan o activar facturación bajo consumo.';
export const NOT_READY_REPLY =
  'Tu cuenta aún no está lista para facturar. Contáctanos para revisar tu configuración.';
export const CREDIT_NOTE_PLAN_REPLY =
  'Las notas de crédito no están disponibles en tu plan actual. Contáctanos para actualizar tu plan.';
export const PRODUCT_MANAGEMENT_PLAN_REPLY =
  'La administración de productos no está disponible en tu plan actual. Contáctanos para actualizar tu plan.';
export const PURCHASE_REGISTRATION_PLAN_REPLY =
  'El registro de compras no está disponible en tu plan actual. Contáctanos para actualizar tu plan.';
export const INVENTORY_FAILURE_REPLY =
  'No pudimos abrir tu inventario, por favor intenta de nuevo.';
export const HELP_REPLY = `🧾 *¿Qué puedo hacer por ti?*

*1. Facturar* 🧾
Escríbeme o mándame una nota de voz con los datos de tu venta.
Ejemplo: "Factura 2 pantalones y una chompa al cliente 1850137918"

*2. Nota de crédito* ↩️
Dime la cédula o RUC del cliente y te muestro sus facturas.
Ejemplo: "Nota de crédito para el cliente 1850137918"

*3. Administrar productos* 📦
Escribe "administrar productos" para editar tu catálogo e inventario.

*4. Registrar una compra* 📄
Envía el archivo XML de tu factura de compra como documento adjunto.

*Otros comandos*
• "iniciar sesión" → vincula tu cuenta de WhatsApp
• "cerrar sesión" → cierra tu sesión
• "ayuda" → muestra este mensaje otra vez

Si una función no está disponible, revisa tu plan o contáctanos para más información.`;
