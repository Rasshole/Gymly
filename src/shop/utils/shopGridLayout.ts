import {spacing} from '@/theme/designTokens';

export const SHOP_GRID_GAP = spacing.md;
export const SHOP_GRID_PAD_H = spacing.md;
export const SHOP_GRID_COLUMNS = 2;

/** Two-column card width from container width — does not stretch a single item. */
export function shopGridCardWidth(
  containerWidth: number,
  columns = SHOP_GRID_COLUMNS,
  gap = SHOP_GRID_GAP,
  padH = SHOP_GRID_PAD_H,
): number {
  if (containerWidth <= 0) {
    return 0;
  }
  const inner = containerWidth - padH * 2 - gap * (columns - 1);
  return Math.floor(inner / columns);
}

export function trimShopSearchQuery(raw: string): string {
  return raw.trim();
}

export function shouldNavigateToShopSearch(raw: string): boolean {
  return trimShopSearchQuery(raw).length > 0;
}

/** Prefer React Navigation `tabBarStyle.display` over focus side-effects. */
export function shouldHideMainTabBarForShopRoute(
  focusedRouteName: string | undefined,
): boolean {
  return focusedRouteName === 'ShopProduct';
}
