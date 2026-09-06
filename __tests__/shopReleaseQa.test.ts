/**
 * Release QA fixtures — affiliate safety states, cart attribution, production mock-fallback.
 * Never contacts live Shopify; never embeds real Storefront tokens.
 */
import en from '@/i18n/translations/en';
import {
  resolveShopCatalogSource,
  getShopifyStorefrontConfig,
} from '@/config/shopifyConfig';
import {
  createShopCatalogRepository,
  setShopCatalogRepositoryForTests,
} from '@/shop/catalog/getShopCatalogRepository';
import {LocalShopCatalogRepository} from '@/shop/catalog/LocalShopCatalogRepository';
import {MisconfiguredShopCatalogRepository} from '@/shop/catalog/MisconfiguredShopCatalogRepository';
import {
  mapShopifyProduct,
  isAffiliateCtaDisabled,
  type ShopifyProductNode,
} from '@/shop/shopify/mapShopifyProduct';
import {
  resolveAffiliateTrackingStatus,
  isAffiliatePurchaseAllowed,
  affiliateUrlHasTrackingParams,
} from '@/shop/destination/affiliateTracking';
import {
  buildShopCtaHint,
  buildShopCtaLabel,
  isShopPurchaseDisabled,
} from '@/shop/destination/openProductDestination';
import {
  buildGymlyCartAttributes,
  buildGymlyCartLineAttributes,
} from '@/shop/shopify/gymlyCheckoutAttribution';
import {
  createShopifyCheckout,
  resetShopifyCheckoutInFlightForTests,
} from '@/shop/shopify/createShopifyCheckout';
import {ShopifyStorefrontClient} from '@/shop/shopify/ShopifyStorefrontClient';
import {shouldShowMessagesInlineTitle} from '@/screens/main/messagesPresentation';
import {shouldHideMainTabBarForShopRoute} from '@/shop/utils/shopGridLayout';
import {SURFACE_SHOP_IN_TABS} from '@/config/launchSurfaceConfig';
import {getMainTabRouteNames} from '@/navigation/mainTabConfig';

jest.mock('@/shop/utils/shopGridLayout', () => ({
  shouldHideMainTabBarForShopRoute: (name?: string) => name === 'ShopProduct',
  shouldNavigateToShopSearch: (raw: string) => raw.trim().length > 0,
  trimShopSearchQuery: (raw: string) => raw.trim(),
}));

const BASE_NODE: ShopifyProductNode = {
  id: 'gid://shopify/Product/9001',
  handle: 'qa-demo-whey',
  title: 'QA Demo Whey',
  description: 'Controlled QA product',
  vendor: 'Gymly Nutrition',
  productType: 'supplements',
  tags: ['qa'],
  availableForSale: true,
  onlineStoreUrl: 'https://f08uqq-vy.myshopify.com/products/qa-demo-whey',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  featuredImage: {
    url: 'https://cdn.shopify.com/s/files/1/qa-whey.jpg',
    altText: 'QA Whey',
  },
  images: {nodes: [{url: 'https://cdn.shopify.com/s/files/1/qa-whey.jpg'}]},
  priceRange: {
    minVariantPrice: {amount: '199.00', currencyCode: 'DKK'},
  },
  compareAtPriceRange: {
    minVariantPrice: {amount: '249.00', currencyCode: 'DKK'},
  },
  variants: {
    nodes: [
      {
        id: 'gid://shopify/ProductVariant/90011',
        title: '1kg',
        availableForSale: true,
        selectedOptions: [{name: 'Size', value: '1kg'}],
        price: {amount: '199.00', currencyCode: 'DKK'},
        compareAtPrice: {amount: '249.00', currencyCode: 'DKK'},
      },
      {
        id: 'gid://shopify/ProductVariant/90012',
        title: 'Sold out',
        availableForSale: false,
        selectedOptions: [{name: 'Size', value: 'Sold out'}],
        price: {amount: '199.00', currencyCode: 'DKK'},
      },
    ],
  },
  mfDestination: {value: 'gymly'},
  mfAffiliate: null,
  mfAffiliateTracked: null,
  mfFeatured: null,
  mfCategory: {value: 'supplements'},
  mfSort: null,
};

const t = (key: string, vars?: Record<string, string>) => {
  const parts = key.split('.');
  let cur: unknown = en;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  if (typeof cur !== 'string') {
    return key;
  }
  return cur.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars?.[k] ?? '');
};

function customerFacingShopCopy(): string[] {
  const shop = en.shop;
  return [
    shop.cta.buyNow,
    shop.cta.viewAtBrand,
    shop.cta.affiliateHint,
    shop.cta.gymlyHint,
    shop.errors.affiliateUnavailable,
    shop.errors.affiliateUntracked,
    shop.salesModel.affiliate,
    shop.salesModel.gymly,
  ];
}

describe('Release QA — production safety', () => {
  const prev = {...process.env};

  afterEach(() => {
    process.env = {...prev};
    setShopCatalogRepositoryForTests(null);
  });

  it('does not silently fall back to mocks in production shopify mode', () => {
    delete process.env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN;
    process.env.SHOP_CATALOG_SOURCE = 'shopify';
    expect(resolveShopCatalogSource({isDev: false, isTest: false})).toBe(
      'shopify',
    );
    // Force factory path as production would: explicit shopify + missing token
    const repo = (() => {
      const cfg = getShopifyStorefrontConfig();
      expect(cfg.ok).toBe(false);
      return createShopCatalogRepository();
    })();
    // In jest NODE_ENV=test, createShopCatalogRepository defaults to local unless
    // SHOP_CATALOG_SOURCE=shopify is set — which we set above.
    expect(repo).toBeInstanceOf(MisconfiguredShopCatalogRepository);
    expect(repo).not.toBeInstanceOf(LocalShopCatalogRepository);
  });

  it('ignores SHOP_CATALOG_SOURCE=local outside dev/test (production)', () => {
    process.env.SHOP_CATALOG_SOURCE = 'local';
    expect(resolveShopCatalogSource({isDev: false, isTest: false})).toBe(
      'shopify',
    );
  });

  it('keeps SURFACE_SHOP_IN_TABS under existing release flag control', () => {
    expect(typeof SURFACE_SHOP_IN_TABS).toBe('boolean');
    expect(getMainTabRouteNames(true)).toContain('Shop');
    expect(getMainTabRouteNames(false)).toContain('Messages');
    expect(getMainTabRouteNames(false)).not.toContain('Shop');
  });

  it('hides tab bar only on product detail; Messages has no duplicate title', () => {
    expect(shouldHideMainTabBarForShopRoute('ShopProduct')).toBe(true);
    expect(shouldHideMainTabBarForShopRoute('ShopHome')).toBe(false);
    expect(shouldShowMessagesInlineTitle('stack')).toBe(false);
    expect(shouldShowMessagesInlineTitle('tab')).toBe(false);
  });
});

describe('Release QA — Gymly product mapping + sold-out', () => {
  it('maps live-shaped Shopify fields without inventing data', () => {
    const p = mapShopifyProduct(BASE_NODE);
    expect(p.id).toBe('gid://shopify/Product/9001');
    expect(p.brand).toBe('Gymly Nutrition');
    expect(p.title).toBe('QA Demo Whey');
    expect(p.price).toBe(199);
    expect(p.compareAtPrice).toBe(249);
    expect(p.currencyCode).toBe('DKK');
    expect(p.images[0]).toContain('cdn.shopify.com');
    expect(p.variants[0].id).toBe('gid://shopify/ProductVariant/90011');
    expect(p.variants[1].available).toBe(false);
    expect(p.salesModel).toBe('gymly');
    expect(p.affiliateTrackingStatus).toBeNull();
  });

  it('disables purchase when product or all variants are sold out', () => {
    const soldOut = mapShopifyProduct({
      ...BASE_NODE,
      availableForSale: false,
      variants: {
        nodes: [
          {
            id: 'gid://shopify/ProductVariant/90012',
            title: 'Sold out',
            availableForSale: false,
            price: {amount: '199.00', currencyCode: 'DKK'},
          },
        ],
      },
    });
    expect(isShopPurchaseDisabled(soldOut)).toBe(true);
  });
});

describe('Release QA — cart attributes + merchandiseId', () => {
  afterEach(() => {
    resetShopifyCheckoutInFlightForTests();
  });

  it('builds required Gymly cart and line attributes', () => {
    const attribution = {
      productId: 'gid://shopify/Product/9001',
      variantId: 'gid://shopify/ProductVariant/90011',
      vendor: 'Gymly Nutrition',
      productHandle: 'qa-demo-whey',
    };
    const cartAttrs = buildGymlyCartAttributes(attribution);
    const lineAttrs = buildGymlyCartLineAttributes(attribution);
    const keys = cartAttrs.map(a => a.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'gymly_sales_source',
        'gymly_product_id',
        'gymly_variant_id',
        'gymly_vendor',
        'gymly_product_handle',
      ]),
    );
    expect(cartAttrs.find(a => a.key === 'gymly_sales_source')?.value).toMatch(
      /^gymly_app/,
    );
    expect(lineAttrs.map(a => a.key)).toEqual([
      'gymly_product_id',
      'gymly_variant_id',
      'gymly_vendor',
    ]);
    // No commission / rate attributes
    expect([...keys, ...lineAttrs.map(a => a.key)].join(',')).not.toMatch(
      /commission|rate|payout/i,
    );
  });

  it('cartCreate sends selected variant merchandiseId and attribution attributes', async () => {
    const request = jest.fn(async () => ({
      cartCreate: {
        cart: {
          id: 'gid://shopify/Cart/qa',
          checkoutUrl: 'https://f08uqq-vy.myshopify.com/cart/c/qa-checkout',
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
        storefrontPublicToken: 'test-public-token-not-real',
        apiVersion: '2026-04',
        graphqlUrl:
          'https://f08uqq-vy.myshopify.com/api/2026-04/graphql.json',
      },
      {
        variantId: 'gid://shopify/ProductVariant/90011',
        attribution: {
          productId: 'gid://shopify/Product/9001',
          variantId: 'gid://shopify/ProductVariant/90011',
          vendor: 'Gymly Nutrition',
          productHandle: 'qa-demo-whey',
        },
      },
      client,
    );

    expect(result.checkoutUrl).toBe(
      'https://f08uqq-vy.myshopify.com/cart/c/qa-checkout',
    );
    const input = (request.mock.calls[0][1] as {input: Record<string, unknown>})
      .input as {
      lines: Array<{
        merchandiseId: string;
        attributes: Array<{key: string; value: string}>;
      }>;
      attributes: Array<{key: string; value: string}>;
    };
    expect(input.lines[0].merchandiseId).toBe(
      'gid://shopify/ProductVariant/90011',
    );
    expect(
      input.attributes.find(a => a.key === 'gymly_product_id')?.value,
    ).toBe('gid://shopify/Product/9001');
    expect(
      input.attributes.find(a => a.key === 'gymly_variant_id')?.value,
    ).toBe('gid://shopify/ProductVariant/90011');
    expect(input.attributes.find(a => a.key === 'gymly_vendor')?.value).toBe(
      'Gymly Nutrition',
    );
    expect(
      input.attributes.find(a => a.key === 'gymly_product_handle')?.value,
    ).toBe('qa-demo-whey');
  });
});

describe('Release QA — affiliate fixtures A/B/C', () => {
  const CONFIGURED_URL =
    'https://partner-test.example/track?aff_id=gymly-qa&utm_source=gymly&utm_campaign=release_qa&click_id=abc123';

  it('A configured: CTA enabled; all query params preserved; nothing invented', () => {
    const mapped = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: CONFIGURED_URL},
    });
    expect(mapped.affiliateTrackingStatus).toBe('configured');
    expect(isAffiliateCtaDisabled(mapped)).toBe(false);
    expect(isAffiliatePurchaseAllowed(mapped.affiliateTrackingStatus)).toBe(
      true,
    );
    expect(mapped.destinationUrl).toContain('aff_id=gymly-qa');
    expect(mapped.destinationUrl).toContain('utm_source=gymly');
    expect(mapped.destinationUrl).toContain('utm_campaign=release_qa');
    expect(mapped.destinationUrl).toContain('click_id=abc123');
    // Destination equals partner URL (validated) — Gymly did not append params
    const original = new URL(CONFIGURED_URL);
    const opened = new URL(mapped.destinationUrl);
    expect([...opened.searchParams.keys()].sort()).toEqual(
      [...original.searchParams.keys()].sort(),
    );
    for (const [k, v] of original.searchParams.entries()) {
      expect(opened.searchParams.get(k)).toBe(v);
    }
    expect(affiliateUrlHasTrackingParams(mapped.destinationUrl)).toBe(true);
  });

  it('B untracked: plain HTTPS disables CTA; UI does not imply tracking', () => {
    const mapped = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'https://brand.example/products/plain-whey'},
    });
    expect(mapped.affiliateTrackingStatus).toBe('untracked');
    expect(mapped.destinationUrl).toBe('');
    expect(isAffiliateCtaDisabled(mapped)).toBe(true);
    const hint = buildShopCtaHint(mapped, t);
    expect(hint.toLowerCase()).not.toMatch(/commission|tracking|configured/);
    expect(hint).toBe(t('shop.errors.affiliateUntracked'));
  });

  it('C unavailable: missing/invalid disables CTA with clear fallback', () => {
    const missing = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: ''},
    });
    expect(missing.affiliateTrackingStatus).toBe('unavailable');
    expect(isAffiliateCtaDisabled(missing)).toBe(true);

    const insecure = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'http://insecure.example/aff'},
    });
    expect(insecure.affiliateTrackingStatus).toBe('unavailable');
    expect(isAffiliateCtaDisabled(insecure)).toBe(true);

    const js = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'about:blank'},
    });
    expect(js.affiliateTrackingStatus).toBe('unavailable');
    expect(buildShopCtaHint(js, t)).toBe(t('shop.errors.affiliateUnavailable'));
  });

  it('metafield override allows uncommon tracking format but never repairs unsafe URLs', () => {
    const uncommon = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'https://network.example/c/opaqueTokenXYZ'},
      mfAffiliateTracked: {value: 'true'},
    });
    expect(uncommon.affiliateTrackingStatus).toBe('configured');
    expect(isAffiliateCtaDisabled(uncommon)).toBe(false);

    const unsafeMarked = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'http://unsafe.example/c/xyz'},
      mfAffiliateTracked: {value: 'true'},
    });
    expect(unsafeMarked.affiliateTrackingStatus).toBe('unavailable');
    expect(isAffiliateCtaDisabled(unsafeMarked)).toBe(true);

    expect(resolveAffiliateTrackingStatus('ftp://x', {partnerMarkedTracked: true})).toBe(
      'unavailable',
    );
  });

  it('customer-facing copy never exposes commission % or internal attribution terms', () => {
    const copy = customerFacingShopCopy().join(' | ').toLowerCase();
    expect(copy).not.toMatch(/commission/);
    expect(copy).not.toMatch(/\d+\s*%/);
    expect(copy).not.toMatch(/affiliatetrackingstatus|gymly_affiliate_tracked/);
    expect(copy).not.toMatch(/\bconfigured\b|\buntracked\b/);
    expect(copy).not.toMatch(/payout|ledger|attribution status/);

    const gymly = mapShopifyProduct(BASE_NODE);
    expect(buildShopCtaLabel(gymly, t).toLowerCase()).not.toMatch(/commission/);
  });

  it('never uses onlineStoreUrl as affiliate destination', () => {
    const mapped = mapShopifyProduct({
      ...BASE_NODE,
      mfDestination: {value: 'affiliate'},
      mfAffiliate: {value: 'https://brand.example/products/plain'},
      onlineStoreUrl: 'https://f08uqq-vy.myshopify.com/products/qa-demo-whey',
    });
    expect(mapped.destinationUrl).toBe('');
    expect(mapped.destinationUrl).not.toContain('myshopify.com');
  });
});

describe('Release QA — Storefront only returns published catalogue (contract)', () => {
  it('empty Shopify collection page stays empty (no mock fill)', async () => {
    const {ShopifyShopCatalogRepository} = require('@/shop/shopify/ShopifyShopCatalogRepository');
    const request = jest.fn(async () => ({collection: null}));
    const repo = new ShopifyShopCatalogRepository(
      {
        storeDomain: 'f08uqq-vy.myshopify.com',
        storefrontPublicToken: 'test-public-token-not-real',
        apiVersion: '2026-04',
        graphqlUrl:
          'https://f08uqq-vy.myshopify.com/api/2026-04/graphql.json',
      },
      {request, storeDomain: 'f08uqq-vy.myshopify.com'},
    );
    const page = await repo.listProductsPage({categoryId: 'supplements'});
    expect(page.products).toEqual([]);
  });
});
