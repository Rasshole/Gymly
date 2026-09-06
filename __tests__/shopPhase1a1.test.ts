import {BottomTabBarHeightContext} from '@react-navigation/bottom-tabs';
import {
  getMainHeaderActions,
  countHeaderActions,
} from '@/navigation/mainHeaderActions';
import {
  shopGridCardWidth,
  shouldNavigateToShopSearch,
  shouldHideMainTabBarForShopRoute,
  trimShopSearchQuery,
  SHOP_GRID_GAP,
  SHOP_GRID_PAD_H,
} from '@/shop/utils/shopGridLayout';
import {resolveOptionalBottomTabBarHeight} from '@/hooks/useOptionalBottomTabBarHeight';
import {validateProductDestinationUrl} from '@/shop/destination/validateProductDestinationUrl';
import {useSavedShopProductsStore} from '@/store/savedShopProductsStore';
import {formatShopPrice, shopDiscountPercent} from '@/shop/utils/formatShopPrice';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';
import {
  SHOP_LAUNCH_CATEGORIES,
  SHOP_SUPPLEMENTS_ICON,
  getShopCategoryIcon,
} from '@/shop/catalog/shopCategories';
import {getMainTabRouteNames} from '@/navigation/mainTabConfig';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

describe('Messages outside bottom-tab context', () => {
  it('falls back to safe-area when tab height context is missing', () => {
    expect(resolveOptionalBottomTabBarHeight(undefined, 34)).toBe(34);
    expect(resolveOptionalBottomTabBarHeight(null, 34)).toBe(34);
  });

  it('uses explicit tab height when present (tab fallback config)', () => {
    expect(resolveOptionalBottomTabBarHeight(83, 34)).toBe(83);
  });

  it('exposes BottomTabBarHeightContext for optional reads (not throwing hook)', () => {
    expect(BottomTabBarHeightContext).toBeDefined();
  });
});

describe('Contextual header actions', () => {
  it('does not crowd all three actions on any main screen', () => {
    for (const tab of ['Home', 'Friends', 'CheckIn', 'Profile', 'Shop'] as const) {
      expect(countHeaderActions(getMainHeaderActions(tab))).toBeLessThan(3);
    }
  });

  it('configures expected actions per screen', () => {
    expect(getMainHeaderActions('Home')).toEqual({
      messages: true,
      calendar: true,
      settings: false,
    });
    expect(getMainHeaderActions('Friends')).toEqual({
      messages: true,
      calendar: false,
      settings: false,
    });
    expect(getMainHeaderActions('CheckIn')).toEqual({
      messages: true,
      calendar: false,
      settings: false,
    });
    expect(getMainHeaderActions('Profile')).toEqual({
      messages: true,
      calendar: false,
      settings: true,
    });
    expect(getMainHeaderActions('Shop')).toEqual({
      messages: false,
      calendar: false,
      settings: false,
    });
  });
});

describe('Shop product navigation + grid', () => {
  it('product route uses productId only', () => {
    const params: ShopStackParamList['ShopProduct'] = {
      productId: 'prod_mp_whey',
    };
    expect(Object.keys(params)).toEqual(['productId']);
  });

  it('keeps normal two-column card width for a single saved item', () => {
    const width = shopGridCardWidth(390);
    const expected = Math.floor(
      (390 - SHOP_GRID_PAD_H * 2 - SHOP_GRID_GAP) / 2,
    );
    expect(width).toBe(expected);
    expect(width).toBeLessThan(390 * 0.6);
  });

  it('price discount helpers remain stable for sale layout', () => {
    expect(shopDiscountPercent(449, 549)).toBe(18);
    expect(formatShopPrice(99, 'DKK', 'da-DK')).toMatch(/99/);
  });

  it('category titles map to launch categories', () => {
    expect(SHOP_LAUNCH_CATEGORIES).toHaveLength(5);
    expect(SHOP_LAUNCH_CATEGORIES.map(c => c.id)).toEqual([
      'activewear',
      'equipment',
      'supplements',
      'recovery',
      'accessories',
    ]);
  });

  it('Supplements uses jar outline icon — not flask', () => {
    expect(getShopCategoryIcon('supplements')).toBe(SHOP_SUPPLEMENTS_ICON);
    expect(getShopCategoryIcon('supplements')).not.toBe('flask-outline');
  });
});

describe('Shop search submit behaviour', () => {
  it('trims submitted queries', () => {
    expect(trimShopSearchQuery('  whey  ')).toBe('whey');
  });

  it('blocks empty/whitespace navigation', () => {
    expect(shouldNavigateToShopSearch('')).toBe(false);
    expect(shouldNavigateToShopSearch('   ')).toBe(false);
    expect(shouldNavigateToShopSearch('bands')).toBe(true);
  });
});

describe('Tab bar hide + five-tab config', () => {
  it('Shop replaces Messages when enabled', () => {
    expect(getMainTabRouteNames(true)).toEqual([
      'Home',
      'Friends',
      'CheckIn',
      'Shop',
      'Profile',
    ]);
    expect(getMainTabRouteNames(false)).toContain('Messages');
  });

  it('hides the tab bar only on ShopProduct', () => {
    expect(shouldHideMainTabBarForShopRoute('ShopProduct')).toBe(true);
    expect(shouldHideMainTabBarForShopRoute('ShopHome')).toBe(false);
    expect(shouldHideMainTabBarForShopRoute('ShopCategory')).toBe(false);
    expect(shouldHideMainTabBarForShopRoute('ShopSearch')).toBe(false);
    expect(shouldHideMainTabBarForShopRoute('SavedProducts')).toBe(false);
    expect(shouldHideMainTabBarForShopRoute(undefined)).toBe(false);
  });
});

describe('Destination validation unchanged', () => {
  it('keeps HTTPS-only destination rules', () => {
    expect(
      validateProductDestinationUrl('https://shop.gymlyapp.com/x').ok,
    ).toBe(true);
    expect(validateProductDestinationUrl('http://example.com').ok).toBe(false);
    expect(validateProductDestinationUrl('gymly://auth/callback').ok).toBe(
      false,
    );
  });
});

describe('Saved product scoping unchanged', () => {
  beforeEach(() => {
    useSavedShopProductsStore.getState().resetForLogout();
  });

  it('isolates saved products per user', async () => {
    await useSavedShopProductsStore.getState().hydrateForUser('u1');
    await useSavedShopProductsStore.getState().toggleSaved('prod_a');
    useSavedShopProductsStore.getState().resetForLogout();
    await useSavedShopProductsStore.getState().hydrateForUser('u2');
    expect(useSavedShopProductsStore.getState().isSaved('prod_a')).toBe(false);
    await useSavedShopProductsStore.getState().hydrateForUser('u1');
    expect(useSavedShopProductsStore.getState().isSaved('prod_a')).toBe(true);
  });
});
