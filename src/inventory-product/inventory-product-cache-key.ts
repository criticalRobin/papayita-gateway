// Shared with inventory-category: a category delete cascades to its products
// in Core API, so the category service must invalidate this cache too.
// Lives in its own file to avoid a circular import between the two services.
export function inventoryProductCacheKey(emisorId: string): string {
  return `inventory-product:${emisorId}`;
}
