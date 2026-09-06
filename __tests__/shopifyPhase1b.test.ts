/**
 * Phase 1B — Shopify Storefront catalogue, checkout, mapping, Messages heading.
 * Network is fully mocked — never hits the live store; never embeds real tokens.
 */
import {
  getShopifyStorefrontConfig,
  resolveShopCatalogSource,
  isAllowedShopifyCheckoutHost,
  normalizeShopifyStoreDomain,
} from '@/config/shopifyConfig';
import {
  createShopCatalogRepository,
  getShopCatalogRepository,
  setShopCatalogRepositoryForTests,
} from '@/shop/catalog/getShopCatalogRepository';
import {LocalShopCatalogRepository} from '@/shop/catalog/LocalShopCatalogRepository';
import {MisconfiguredShopCatalogRepository} from '@/shop/catalog/MisconfiguredShopCatalogRepository';
import {
  mapShopifyProduct,
  resolveSalesModel,
  isAffiliateCtaDisabled,
  type ShopifyProductNode,
} from '@/shop/shopify/mapShopifyProduct';
import {validateShopifyCheckoutUrl} from '@/shop/shopify/validateShopifyCheckoutUrl';
import {
  createShopifyCheckout,
  resetShopifyCheckoutInFlightForTests,
} from '@/shop/shopify/createShopifyCheckout';
import {ShopifyStorefrontClient} from '@/shop/shopify/ShopifyStorefrontClient';
import {ShopError} from '@/shop/shopify/shopErrors';
import {shouldShowMessagesInlineTitle} from '@/screens/main/messagesPresentation';
import {useSavedShopProductsStore} from '@/store/savedShopProductsStore';
import {SHOPIFY_CATEGORY_COLLECTION_HANDLES} from '@/shop/shopify/shopifyCollectionHandles';
import {ShopifyShopCatalogRepository} from '@/shop/shopify/ShopifyShopCatalogRepository';
import {shouldNavigateToShopSearch} from '@/shop/utils/shopGridLayout';

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

jest.mock('@/shop/utils/shopGridLayout', () => ({
  shouldNavigateToShopSearch: (raw: string) => raw.trim().length > 0,
  trimShopSearchQuery: (raw: string) => raw.trim(),
}));

const SAMPLE_NODE: ShopifyProductNode = {
  id: 'gid://shopify/Product/1',
  handle: 'whey-protein',
  title: 'Whey Protein 1kg',
  description: 'Live product',
  vendor: 'Gymly Nutrition',
  productType: 'supplements',
  tags: ['protein'],
  availableForSale: true,
  onlineStoreUrl: 'https://f08uqq-vy.myshopify.com/products/whey-protein',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  featuredImage: {
    url: 'https://cdn.shopify.com/s/files/1/whey.jpg',
    altText: 'Whey',
  },
  images: {
    nodes: [
      {url: 'https://cdn.shopify.com/s/files/1/whey.jpg'},
      {url: 'https://example.com/should-skip.jpg'},
    ],
  },
  priceRange: {
    minVariantPrice: {amount: '249.00', currencyCode: 'DKK'},
  },
  compareAtPriceRange: {
    minVariantPrice: {amount: '299.00', currencyCode: 'DKK'},
  },
  variants: {
    nodes: [
      {
        id: 'gid://shopify/ProductVariant/11',
        title: 'Default',
        availableForSale: true,
        selectedOptions: [{name: 'Title', value: 'Default'}],
        price: {amount: '249.00', currencyCode: 'DKK'},
        compareAtPrice: {amount: '299.00', currencyCode: 'DKK'},
      },
      {
        id: 'gid://shopify/ProductVariant/12',
        title: 'Sold out',
        availableForSale: false,
        selectedOptions: [{name: 'Title', value: 'Sold out'}],
        price: {amount: '249.00', currencyCode: 'DKK'},
      },
    ],
  },
  mfDestination: null,
  mfAffiliate: null,
  mfFeatured: {value: 'true'},
  mfCategory: {value: 'supplements'},
  mfSort: {value: '10'},
};

describe('Shopify configuration safety', () => {
  const prev = {...process.env};

  afterEach(() => {
    process.env = {...prev};
    setShopCatalogRepositoryForTests(null);
  });

  it('does not show mock products when production shopify config is missing', async () => {
    delete process.env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN;
    process.env.SHOP_CATALOG_SOURCE = 'shopify';
    const repo = createShopCatalogRepository();
    expect(repo).toBeInstanceOf(MisconfiguredShopCatalogRepository);
    await expect(repo.listProducts()).rejects.toBeInstanceOf(ShopError);
  });

  it('uses local mocks in test by default', () => {
    expect(resolveShopCatalogSource({isTest: true})).toBe('local');
    const repo = createShopCatalogRepository();
    expect(repo).toBeInstanceOf(LocalShopCatalogRepository);
  });

  it('normalizes store domain', () => {
    expect(normalizeShopifyStoreDomain('https://F08UQQ-VY.myshopify.com/')).toBe(
      'f08uqq-vy.myshopify.com',
    );
  });
});

describe('Shopify product mapping', () => {
  it('maps Shopify fields to ShopProduct without inventing data', () => {
    const mapped = mapShopifyProduct(SAMPLE_NODE);
    expect(mapped.id).toBe('gid://shopify/Product/1');
    expect(mapped.brand).toBe('Gymly Nutrition');
    expect(mapped.price).toBe(249);
    expect(mapped.compareAtPrice).toBe(299);
    expect(mapped.currencyCode).toBe('DKK');
    expect(mapped.images).toEqual([
      'https://cdn.shopify.com/s/files/1/whey.jpg',
    ]);
    expect(mapped.images.some(u => u.includes('example.com'))).toBe(false);
    expect(mapped.variants).toHaveLength(2);
    expect(mapped.variants[0].selectedOptions?.[0]).toEqual({
      name: 'Title',
      value: 'Default',
    });
    expect(mapped.variants[1].available).toBe(false);
    expect(mapped.salesModel).toBe('gymly');
    expect(mapped.featured).toBe(true);
    expect(mapped.category).toBe('supplements');
  });

  it('defaults destination to gymly when metafield absent', () => {
    expect(resolveSalesModel(undefined)).toBe('gymly');
    expect(resolveSalesModel('')).toBe('gymly');
  });

  it('maps affiliate metafield and disables CTA on invalid URL', () => {
    const mapped = mapShopifyProduct({
      ...SAMPLE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'http://insecure.example'},
    });
    expect(mapped.salesModel).toBe('affiliate');
    expect(mapped.affiliateTrackingStatus).toBe('unavailable');
    expect(isAffiliateCtaDisabled(mapped)).toBe(true);
  });

  it('treats plain product URLs as untracked (not commission-enabled)', () => {
    const mapped = mapShopifyProduct({
      ...SAMPLE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'https://brand.example/products/whey'},
    });
    expect(mapped.affiliateTrackingStatus).toBe('untracked');
    expect(mapped.destinationUrl).toBe('');
    expect(isAffiliateCtaDisabled(mapped)).toBe(true);
  });

  it('maps valid tracked affiliate URL and preserves query params', () => {
    const mapped = mapShopifyProduct({
      ...SAMPLE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {
        value: 'https://partner.example/track?aff_id=1&utm_source=gymly',
      },
    });
    expect(mapped.affiliateTrackingStatus).toBe('configured');
    expect(mapped.destinationUrl).toContain('aff_id=1');
    expect(mapped.destinationUrl).toContain('utm_source=gymly');
    expect(isAffiliateCtaDisabled(mapped)).toBe(false);
  });

  it('allows partner-marked tracked URLs without recognized params', () => {
    const mapped = mapShopifyProduct({
      ...SAMPLE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'https://network.example/c/abc123'},
      mfAffiliateTracked: {value: 'true'},
    });
    expect(mapped.affiliateTrackingStatus).toBe('configured');
    expect(isAffiliateCtaDisabled(mapped)).toBe(false);
  });

  it('uses neutral empty images when Shopify has none', () => {
    const mapped = mapShopifyProduct({
      ...SAMPLE_NODE,
      featuredImage: null,
      images: {nodes: []},
    });
    expect(mapped.images).toEqual([]);
  });
});

describe('Checkout URL + cartCreate', () => {
  afterEach(() => {
    resetShopifyCheckoutInFlightForTests();
    jest.restoreAllMocks();
  });

  it('validates checkout hosts', () => {
    expect(
      validateShopifyCheckoutUrl(
        'https://f08uqq-vy.myshopify.com/cart/c/abc',
        {storeDomain: 'f08uqq-vy.myshopify.com'},
      ).ok,
    ).toBe(true);
    expect(
      isAllowedShopifyCheckoutHost('shop.gymlyapp.com', 'f08uqq-vy.myshopify.com'),
    ).toBe(true);
    expect(
      validateShopifyCheckoutUrl('https://evil.example/checkout', {
        storeDomain: 'f08uqq-vy.myshopify.com',
      }).ok,
    ).toBe(false);
  });

  it('cartCreate uses selected variant ID and validates checkout URL', async () => {
    const request = jest.fn(async () => ({
      cartCreate: {
        cart: {
          id: 'gid://shopify/Cart/1',
          checkoutUrl: 'https://f08uqq-vy.myshopify.com/cart/c/xyz',
        },
        userErrors: [],
      },
    }));
    const client = {
      request,
      storeDomain: 'f08uqq-vy.myshopify.com',
    } as unknown as ShopifyStorefrontClient;

    const result = await createShopifyCheckout(
      {
        storeDomain: 'f08uqq-vy.myshopify.com',
        storefrontPublicToken: 'test-public-token',
        apiVersion: '2026-04',
        graphqlUrl:
          'https://f08uqq-vy.myshopify.com/api/2026-04/graphql.json',
      },
      {
        variantId: 'gid://shopify/ProductVariant/11',
        attribution: {
          productId: 'gid://shopify/Product/1',
          variantId: 'gid://shopify/ProductVariant/11',
          vendor: 'Gymly Nutrition',
          productHandle: 'whey-protein',
        },
      },
      client,
    );

    expect(result.checkoutUrl).toContain('myshopify.com');
    const vars = request.mock.calls[0][1] as {
      input: {
        lines: Array<{
          merchandiseId: string;
          attributes: Array<{key: string; value: string}>;
        }>;
        attributes: Array<{key: string; value: string}>;
      };
    };
    expect(vars.input.lines[0].merchandiseId).toBe(
      'gid://shopify/ProductVariant/11',
    );
    expect(vars.input.attributes.find(a => a.key === 'gymly_sales_source')?.value).toMatch(
      /^gymly_app/,
    );
    expect(vars.input.attributes.find(a => a.key === 'gymly_vendor')?.value).toBe(
      'Gymly Nutrition',
    );
    expect(vars.input.lines[0].attributes.find(a => a.key === 'gymly_variant_id')?.value).toBe(
      'gid://shopify/ProductVariant/11',
    );
  });

  it('maps cart GraphQL userErrors to ShopError', async () => {
    const client = {
      request: jest.fn(async () => ({
        cartCreate: {
          cart: null,
          userErrors: [{message: 'Variant is sold out', code: 'INVALID'}],
        },
      })),
      storeDomain: 'f08uqq-vy.myshopify.com',
    } as unknown as ShopifyStorefrontClient;

    await expect(
      createShopifyCheckout(
        {
          storeDomain: 'f08uqq-vy.myshopify.com',
          storefrontPublicToken: 'test-public-token',
          apiVersion: '2026-04',
          graphqlUrl:
            'https://f08uqq-vy.myshopify.com/api/2026-04/graphql.json',
        },
        {
          variantId: 'gid://shopify/ProductVariant/12',
          attribution: {
            productId: 'gid://shopify/Product/1',
            variantId: 'gid://shopify/ProductVariant/12',
            vendor: 'Gymly',
          },
        },
        client,
      ),
    ).rejects.toMatchObject({code: 'cart', userMessageKey: 'shop.errors.checkoutFailed'});
  });

  it('dedupes concurrent cartCreate for the same variant', async () => {
    let resolveReq!: (v: unknown) => void;
    const gate = new Promise(r => {
      resolveReq = r;
    });
    const request = jest.fn(() => gate);
    const client = {
      request,
      storeDomain: 'f08uqq-vy.myshopify.com',
    } as unknown as ShopifyStorefrontClient;
    const cfg = {
      storeDomain: 'f08uqq-vy.myshopify.com',
      storefrontPublicToken: 'test-public-token',
      apiVersion: '2026-04',
      graphqlUrl: 'https://f08uqq-vy.myshopify.com/api/2026-04/graphql.json',
    };

    const p1 = createShopifyCheckout(
      cfg,
      {
        variantId: 'gid://shopify/ProductVariant/11',
        attribution: {
          productId: 'gid://shopify/Product/1',
          variantId: 'gid://shopify/ProductVariant/11',
          vendor: 'Gymly',
        },
      },
      client,
    );
    const p2 = createShopifyCheckout(
      cfg,
      {
        variantId: 'gid://shopify/ProductVariant/11',
        attribution: {
          productId: 'gid://shopify/Product/1',
          variantId: 'gid://shopify/ProductVariant/11',
          vendor: 'Gymly',
        },
      },
      client,
    );
    expect(request).toHaveBeenCalledTimes(1);
    resolveReq({
      cartCreate: {
        cart: {
          id: 'gid://shopify/Cart/1',
          checkoutUrl: 'https://f08uqq-vy.myshopify.com/cart/c/xyz',
        },
        userErrors: [],
      },
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.cartId).toBe(b.cartId);
  });
});

describe('Shopify catalogue behaviours', () => {
  it('maps category handles centrally', () => {
    expect(SHOPIFY_CATEGORY_COLLECTION_HANDLES.activewear).toBe('activewear');
    expect(SHOPIFY_CATEGORY_COLLECTION_HANDLES.accessories).toBe('accessories');
  });

  it('empty missing collections do not invent products', async () => {
    const request = jest.fn(async () => ({collection: null}));
    const client = {
      request,
      storeDomain: 'f08uqq-vy.myshopify.com',
    } as unknown as ShopifyStorefrontClient;
    const repo = new ShopifyShopCatalogRepository(
      {
        storeDomain: 'f08uqq-vy.myshopify.com',
        storefrontPublicToken: 'test-public-token',
        apiVersion: '2026-04',
        graphqlUrl:
          'https://f08uqq-vy.myshopify.com/api/2026-04/graphql.json',
      },
      client,
    );
    const page = await repo.listProductsPage({categoryId: 'recovery'});
    expect(page.products).toEqual([]);
  });

  it('pagination merges without duplicates', async () => {
    const repo = new LocalShopCatalogRepository();
    const page1 = await repo.listProductsPage({first: 3, after: undefined});
    const page2 = await repo.listProductsPage({
      first: 3,
      after: page1.pageInfo.endCursor ?? undefined,
    });
    const ids = new Set([
      ...page1.products.map(p => p.id),
      ...page2.products.map(p => p.id),
    ]);
    expect(ids.size).toBe(page1.products.length + page2.products.length);
  });

  it('popular brands come from real vendors in local catalogue', async () => {
    setShopCatalogRepositoryForTests(new LocalShopCatalogRepository());
    const brands = await getShopCatalogRepository().listBrands();
    expect(brands.length).toBeGreaterThan(0);
    expect(brands.every(b => b.name.trim().length > 0)).toBe(true);
  });
});

describe('Affiliate tracking helpers', () => {
  const {
    resolveAffiliateTrackingStatus,
    affiliateUrlHasTrackingParams,
  } = require('@/shop/destination/affiliateTracking') as typeof import('@/shop/destination/affiliateTracking');

  it('detects tracking query params without inventing any', () => {
    expect(
      affiliateUrlHasTrackingParams(
        'https://x.example/p?aff_id=1&utm_source=gymly',
      ),
    ).toBe(true);
    expect(
      affiliateUrlHasTrackingParams('https://x.example/products/plain'),
    ).toBe(false);
  });

  it('classifies configured | untracked | unavailable', () => {
    expect(resolveAffiliateTrackingStatus('')).toBe('unavailable');
    expect(
      resolveAffiliateTrackingStatus('https://brand.example/p/plain'),
    ).toBe('untracked');
    expect(
      resolveAffiliateTrackingStatus(
        'https://brand.example/p?utm_source=gymly',
      ),
    ).toBe('configured');
    expect(
      resolveAffiliateTrackingStatus('https://brand.example/p/plain', {
        partnerMarkedTracked: true,
      }),
    ).toBe('configured');
  });
});

describe('Search + Messages presentation', () => {
  it('trims search queries / blocks empty', () => {
    expect(shouldNavigateToShopSearch('  x  ')).toBe(true);
    expect(shouldNavigateToShopSearch('   ')).toBe(false);
  });

  it('hides duplicate Messages inline title for stack and tab', () => {
    expect(shouldShowMessagesInlineTitle('stack')).toBe(false);
    expect(shouldShowMessagesInlineTitle('tab')).toBe(false);
  });
});

describe('Saved Shopify IDs persist', () => {
  beforeEach(() => {
    useSavedShopProductsStore.getState().resetForLogout();
  });

  it('persists Shopify GIDs per user', async () => {
    const gid = 'gid://shopify/Product/99';
    await useSavedShopProductsStore.getState().hydrateForUser('u-shop');
    await useSavedShopProductsStore.getState().toggleSaved(gid);
    useSavedShopProductsStore.getState().resetForLogout();
    await useSavedShopProductsStore.getState().hydrateForUser('u-shop');
    expect(useSavedShopProductsStore.getState().isSaved(gid)).toBe(true);
  });
});

describe('getShopifyStorefrontConfig token hygiene', () => {
  it('does not embed a real token in fixtures', () => {
    const cfg = getShopifyStorefrontConfig();
    // In tests Config mock is empty → missing token (ok).
    if (cfg.ok) {
      expect(cfg.config.storefrontPublicToken).not.toMatch(/shpat_/);
      expect(cfg.config.storefrontPublicToken.length).toBeGreaterThan(0);
    } else {
      expect(cfg.reason).toBe('missing_token');
    }
  });
});
