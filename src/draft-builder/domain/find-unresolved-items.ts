import { DraftItem } from './types';

// Zero catalog candidates for an item ('unresolved') means the webview has
// nothing to offer the user for it — unlike 'needs_choice' (2+ candidates,
// user picks), there's no path to complete the invoice. We never send a
// partial-catalog draft: a business can't bill for products it does and
// doesn't have in one document.
export function findUnresolvedItems(items: DraftItem[]): DraftItem[] {
  return items.filter((item) => item.resolutionStatus === 'unresolved');
}
