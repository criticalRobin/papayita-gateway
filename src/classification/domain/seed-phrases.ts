import { IntentCategory } from './types';

// Few-shot examples for embedding-similarity scoring. Most greetings are
// already caught by rules.ts's fast path — these exist only to cover
// unusual phrasing that the rule list misses.
//
// out_of_context is deliberately empty: "off-topic" isn't a coherent
// semantic cluster you can seed with a handful of examples. It's derived
// instead as the low-confidence fallback in similarity.ts — nothing scored
// above threshold against any of the three real categories below.
export const SEED_PHRASES: Record<IntentCategory, string[]> = {
  greeting: ['hola buenas', 'buenos dias como estan', 'muy buenas tardes'],
  info_request: [
    'cuanto cuesta usar este servicio',
    'como funciona esto',
    'necesito ayuda para entender como facturar',
    'que necesito para registrarme',
    'puedo facturar con ustedes',
    'que documentos necesito para emitir una factura',
    'cual es el costo del servicio',
    'como me registro',
    'quiero saber mas sobre el servicio',
    'esto tiene algun costo',
  ],
  billing_attempt: [
    'quiero facturar dos colas a nombre de juan perez cedula 1234567890',
    'necesito una factura para maria lopez',
    'factura a nombre de pedro con ruc 1790012345001',
    'vendi tres camisetas necesito emitir la factura',
    'facturame esta compra por favor',
    'quiero emitir un comprobante para un cliente',
    'necesito facturar una venta de hoy',
    'hazme una factura de dos pizzas',
    'emite una factura por la venta de dos productos al cliente 1850137918',
    'vendi un manga y una figura necesito la factura de estos productos',
    'cobra esta venta y hazme la factura por favor',
    'necesito facturar varios articulos a un cliente',
    'genera el comprobante de esta venta a nombre del cliente',
  ],
  out_of_context: [],
};
