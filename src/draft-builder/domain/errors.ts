// One fixable problem found while building a draft. Collected all at once
// (not first-failure-wins) so the user learns every problem in a single
// WhatsApp reply — each extra round-trip is a real message cost.
export type BillingIssue =
  | {
      kind: 'identificacion_no_encontrada';
      identificacion: string;
      // Core API's own plain-language Spanish message, relayed as-is.
      detalle: string;
    }
  | { kind: 'producto_no_encontrado'; termino: string };

// Thrown by DraftBuilderService.buildDraft() when the buyer's cédula/RUC
// wasn't found in SRI and/or one or more extracted items had zero catalog
// candidates. The caller (whatsapp-inbound.processor) must not send the
// draft CTA — it opens the billing correction window instead (see
// conversation-state/domain/billing-context.ts). buildDraft never persists
// DRAFT_READY when this is thrown.
export class IncompleteBillingAttemptError extends Error {
  constructor(readonly issues: BillingIssue[]) {
    super(
      `incomplete billing attempt: ${issues.map((i) => i.kind).join(', ')}`,
    );
  }
}

// Plain-language problem line for the LLM refine prompt.
export function describeBillingIssue(issue: BillingIssue): string {
  switch (issue.kind) {
    case 'identificacion_no_encontrada':
      return `La identificación ${issue.identificacion} del comprador no existe en el SRI.`;
    case 'producto_no_encontrado':
      return `El producto "${issue.termino}" no está en el catálogo.`;
  }
}
