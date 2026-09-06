import {SURFACE_SHOP_IN_TABS} from '@/config/launchSurfaceConfig';

/**
 * Canonical main-tab route names for the balanced five-tab bar.
 * Shop replaces Messages when SURFACE_SHOP_IN_TABS is enabled.
 */
export function getMainTabRouteNames(
  shopEnabled: boolean = SURFACE_SHOP_IN_TABS,
): readonly string[] {
  if (shopEnabled) {
    return ['Home', 'Friends', 'CheckIn', 'Shop', 'Profile'] as const;
  }
  return ['Home', 'Friends', 'CheckIn', 'Messages', 'Profile'] as const;
}

export function isShopTabEnabled(shopEnabled: boolean = SURFACE_SHOP_IN_TABS): boolean {
  return shopEnabled;
}
