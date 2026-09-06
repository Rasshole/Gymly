import type {ShopCategoryId} from '@/types/shop.types';

export type ShopCategoryDefinition = {
  id: ShopCategoryId;
  /** i18n key under shop.categories.* */
  labelKey: string;
  /**
   * Ionicons name, or `supplement-jar` for the custom outline jar
   * (consumer supplements — not a lab flask).
   */
  icon: string;
};

/** Custom Shop category icon key (rendered via SupplementJarIcon). */
export const SHOP_SUPPLEMENTS_ICON = 'supplement-jar';

export const SHOP_LAUNCH_CATEGORIES: readonly ShopCategoryDefinition[] = [
  {id: 'activewear', labelKey: 'shop.categories.activewear', icon: 'shirt-outline'},
  {id: 'equipment', labelKey: 'shop.categories.equipment', icon: 'barbell-outline'},
  {
    id: 'supplements',
    labelKey: 'shop.categories.supplements',
    icon: SHOP_SUPPLEMENTS_ICON,
  },
  {id: 'recovery', labelKey: 'shop.categories.recovery', icon: 'leaf-outline'},
  {id: 'accessories', labelKey: 'shop.categories.accessories', icon: 'watch-outline'},
] as const;

export function isShopCategoryId(value: string): value is ShopCategoryId {
  return SHOP_LAUNCH_CATEGORIES.some(c => c.id === value);
}

export function getShopCategoryIcon(categoryId: ShopCategoryId): string {
  return (
    SHOP_LAUNCH_CATEGORIES.find(c => c.id === categoryId)?.icon ?? 'ellipse-outline'
  );
}
