// Thrown by DraftBuilderService.buildDraft() when one or more extracted
// items had zero catalog candidates. The caller (whatsapp-inbound.processor)
// must not send the draft CTA — it sends a text reply naming the missing
// terms instead, and never persists conversation state (stays 'idle' so the
// user can retry immediately).
export class UnresolvedCatalogItemsError extends Error {
  constructor(readonly missingTerms: string[]) {
    super(`no catalog candidates for: ${missingTerms.join(', ')}`);
  }
}
