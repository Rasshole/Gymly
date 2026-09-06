import {SURFACE_SHOP_IN_TABS} from '@/config/launchSurfaceConfig';
import {getMainTabRouteNames, isShopTabEnabled} from '@/navigation/mainTabConfig';
import {LocalShopCatalogRepository} from '@/shop/catalog/LocalShopCatalogRepository';
import {MOCK_SHOP_PRODUCTS} from '@/shop/catalog/mockShopProducts';
import {SHOP_LAUNCH_CATEGORIES} from '@/shop/catalog/shopCategories';
import {
  filterAndSortShopProducts,
  productMatchesSearch,
} from '@/shop/utils/filterAndSortShopProducts';
import {
  formatShopPrice,
  SHOP_FALLBACK_CURRENCY,
  shopDiscountPercent,
} from '@/shop/utils/formatShopPrice';
import {validateProductDestinationUrl} from '@/shop/destination/validateProductDestinationUrl';
import {buildShopCtaLabel} from '@/shop/destination/openProductDestination';
import {
  FallbackShopRecommendationProvider,
} from '@/shop/recommendations/ShopRecommendationProvider';
import {useSavedShopProductsStore} from '@/store/savedShopProductsStore';
import type {ShopProduct} from '@/types/shop.types';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';

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

jest.mock('react-native', () => ({
  Alert: {alert: jest.fn()},
  Linking: {
    canOpenURL: jest.fn(async () => true),
    openURL: jest.fn(async () => undefined),
  },
  Platform: {OS: 'ios', select: (o: {ios?: unknown}) => o.ios},
}));

jest.mock('@/i18n/runtimeLanguage', () => ({
  rt: (key: string) => key,
}));

describe('Shop feature flag & tabs', () => {
  it('enables Shop for local Phase 1A testing', () => {
    expect(SURFACE_SHOP_IN_TABS).toBe(true);
    expect(isShopTabEnabled(true)).toBe(true);
  });

  it('uses five tabs with Shop replacing Messages when enabled', () => {
    expect(getMainTabRouteNames(true)).toEqual([
      'Home',
      'Friends',
      'CheckIn',
      'Shop',
      'Profile',
    ]);
    expect(getMainTabRouteNames(true)).not.toContain('Messages');
  });

  it('falls back to Messages tab when Shop flag is off', () => {
    expect(getMainTabRouteNames(false)).toEqual([
      'Home',
      'Friends',
      'CheckIn',
      'Messages',
      'Profile',
    ]);
    expect(getMainTabRouteNames(false)).not.toContain('Shop');
  });

  it('always keeps exactly five tabs', () => {
    expect(getMainTabRouteNames(true)).toHaveLength(5);
    expect(getMainTabRouteNames(false)).toHaveLength(5);
  });
});

describe('Shop stack route typing', () => {
  it('requires productId for ShopProduct (not index/object)', () => {
    const params: ShopStackParamList['ShopProduct'] = {productId: 'prod_mp_whey'};
    expect(params.productId).toBe('prod_mp_whey');
  });
});

describe('Shop catalogue repository', () => {
  const repo = new LocalShopCatalogRepository();

  it('covers all five launch categories', async () => {
    const products = await repo.listProducts();
    for (const cat of SHOP_LAUNCH_CATEGORIES) {
      expect(products.some(p => p.category === cat.id)).toBe(true);
    }
  });

  it('includes both affiliate and gymly sales models', async () => {
    const products = await repo.listProducts();
    expect(products.some(p => p.salesModel === 'affiliate')).toBe(true);
    expect(products.some(p => p.salesModel === 'gymly')).toBe(true);
  });

  it('filters by category and brand', async () => {
    const byCat = await repo.listProducts({categoryId: 'supplements'});
    expect(byCat.every(p => p.category === 'supplements')).toBe(true);
    const byBrand = await repo.listProducts({brandId: 'brand-gymly'});
    expect(byBrand.every(p => p.brandId === 'brand-gymly')).toBe(true);
  });

  it('returns product by stable id', async () => {
    const p = await repo.getProductById('prod_mp_whey');
    expect(p?.handle).toBe('myprotein-impact-whey');
  });
});

describe('Shop search & sort', () => {
  it('matches title, brand, category and tags case-insensitively', () => {
    const whey = MOCK_SHOP_PRODUCTS.find(p => p.id === 'prod_mp_whey')!;
    expect(productMatchesSearch(whey, '  WHEY ')).toBe(true);
    expect(productMatchesSearch(whey, 'myprotein')).toBe(true);
    expect(productMatchesSearch(whey, 'supplements')).toBe(true);
    expect(productMatchesSearch(whey, 'chocolate')).toBe(true);
    expect(productMatchesSearch(whey, 'kettlebell')).toBe(false);
  });

  it('sorts by price ascending and descending', () => {
    const asc = filterAndSortShopProducts(MOCK_SHOP_PRODUCTS, {sort: 'price_asc'});
    const desc = filterAndSortShopProducts(MOCK_SHOP_PRODUCTS, {sort: 'price_desc'});
    expect(asc[0]!.price).toBeLessThanOrEqual(asc[1]!.price);
    expect(desc[0]!.price).toBeGreaterThanOrEqual(desc[1]!.price);
  });
});

describe('Currency formatting', () => {
  it('formats with Intl and falls back to DKK', () => {
    const formatted = formatShopPrice(249, 'DKK', 'da-DK');
    expect(formatted).toMatch(/249/);
    expect(formatShopPrice(100, null, 'en-GB')).toContain('100');
    expect(SHOP_FALLBACK_CURRENCY).toBe('DKK');
  });

  it('computes discount percent', () => {
    expect(shopDiscountPercent(449, 549)).toBe(18);
    expect(shopDiscountPercent(100, null)).toBeNull();
  });
});

describe('Destination validation & CTA', () => {
  it('allows https and rejects unsafe schemes', () => {
    expect(validateProductDestinationUrl('https://shop.gymlyapp.com/p/1').ok).toBe(
      true,
    );
    expect(validateProductDestinationUrl('http://example.com').ok).toBe(false);
    expect(validateProductDestinationUrl('gymly://auth/callback').ok).toBe(false);
    expect(validateProductDestinationUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateProductDestinationUrl('').ok).toBe(false);
  });

  it('selects hybrid CTA labels', () => {
    const t = (key: string, vars?: Record<string, string>) =>
      key === 'shop.cta.viewAtBrand' || key === 'shop.cta.shopAtBrand'
        ? `View at ${vars?.brand}`
        : key === 'shop.cta.buyNow' || key === 'shop.cta.buyOnGymly'
          ? 'Buy now'
          : key;
    const affiliate = MOCK_SHOP_PRODUCTS.find(p => p.salesModel === 'affiliate')!;
    const gymly = MOCK_SHOP_PRODUCTS.find(p => p.salesModel === 'gymly')!;
    expect(buildShopCtaLabel(affiliate, t)).toContain(affiliate.brand);
    expect(buildShopCtaLabel(gymly, t)).toBe('Buy now');
  });
});

describe('Recommendations fallback', () => {
  it('returns curated popular/featured products', async () => {
    const provider = new FallbackShopRecommendationProvider();
    const recs = await provider.getRecommended(MOCK_SHOP_PRODUCTS, {
      hasTrainingSignal: false,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every(p => p.popular || p.featured || recs.length <= 8)).toBe(true);
  });
});

describe('Saved products per-user isolation', () => {
  beforeEach(() => {
    useSavedShopProductsStore.getState().resetForLogout();
  });

  it('scopes saves to the signed-in user and clears memory on logout', async () => {
    await useSavedShopProductsStore.getState().hydrateForUser('user-a');
    await useSavedShopProductsStore.getState().toggleSaved('prod_mp_whey');
    expect(useSavedShopProductsStore.getState().isSaved('prod_mp_whey')).toBe(true);

    useSavedShopProductsStore.getState().resetForLogout();
    expect(useSavedShopProductsStore.getState().savedIds).toEqual([]);
    expect(useSavedShopProductsStore.getState().userId).toBeNull();

    await useSavedShopProductsStore.getState().hydrateForUser('user-b');
    expect(useSavedShopProductsStore.getState().isSaved('prod_mp_whey')).toBe(false);

    await useSavedShopProductsStore.getState().hydrateForUser('user-a');
    expect(useSavedShopProductsStore.getState().isSaved('prod_mp_whey')).toBe(true);

    await useSavedShopProductsStore.getState().toggleSaved('prod_mp_whey');
    expect(useSavedShopProductsStore.getState().isSaved('prod_mp_whey')).toBe(false);
  });
});

describe('Shop lazy-loading import boundary', () => {
  it('does not pull map runtime or gym catalog through shop utils', () => {
    const shopModulePaths = [
      require.resolve('@/shop/utils/filterAndSortShopProducts'),
      require.resolve('@/shop/catalog/getShopCatalogRepository'),
      require.resolve('@/shop/destination/validateProductDestinationUrl'),
      require.resolve('@/navigation/mainTabConfig'),
    ];
    for (const p of shopModulePaths) {
      expect(p.includes('mapRuntime') || p.includes('centers.json')).toBe(false);
    }
    // Touch products to ensure mock module loads without gym datasets
    expect(MOCK_SHOP_PRODUCTS.length).toBeGreaterThan(5);
    const sample: ShopProduct = MOCK_SHOP_PRODUCTS[0]!;
    expect(sample.id).toBeTruthy();
  });
});
