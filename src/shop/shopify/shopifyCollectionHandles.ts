/**
 * Central map: Gymly ShopCategoryId → Shopify collection handle.
 * Change handles here if Shopify collection URLs differ.
 */
import type {ShopCategoryId} from '@/types/shop.types';

export const SHOPIFY_CATEGORY_COLLECTION_HANDLES: Record<
  ShopCategoryId,
  string
> = {
  activewear: 'activewear',
  equipment: 'equipment',
  supplements: 'supplements',
  recovery: 'recovery',
  accessories: 'accessories',
};

/** Featured products collection handle (optional fallback after metafield). */
export const SHOPIFY_FEATURED_COLLECTION_HANDLE = 'featured';

/**
 * Featured products rule (Phase 1B):
 * 1. Products with metafield custom.gymly_featured truthy
 * 2. Else products from collection handle `featured`
 * 3. Else first available products from the live catalogue (deterministic title order)
 */
export const SHOPIFY_FEATURED_RULE =
  'metafield custom.gymly_featured → collection `featured` → live catalogue fallback';

export function collectionHandleForCategory(
  categoryId: ShopCategoryId,
): string {
  return SHOPIFY_CATEGORY_COLLECTION_HANDLES[categoryId];
}
