import { CatalogProduct } from '../../catalog/catalog-search.interface';
import { CandidateResolution } from './types';

// Arity-based replacement for the stale probabilidad-based threshold design —
// the real catalog-search response has no confidence score at all.
//   0 candidates -> unresolved (webview shows manual-entry/escalation state)
//   1 candidate  -> auto_selected, still user-editable
//   2+ candidates -> needs_choice, none pre-selected
export function resolveCandidates(
  productos: CatalogProduct[],
): CandidateResolution {
  if (productos.length === 0) {
    return { status: 'unresolved', candidates: [] };
  }
  if (productos.length === 1) {
    return {
      status: 'auto_selected',
      candidates: [productos[0]],
      selectedCandidateId: productos[0].id,
    };
  }
  return { status: 'needs_choice', candidates: productos };
}
