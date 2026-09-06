/**
 * In-app Shopify checkout browser (SFSafariView / Chrome Custom Tabs) + fallbacks.
 * Never contacts live Shopify; never embeds tokens or storefront passwords.
 */
import {Alert} from 'react-native';
import {
  openShopCheckoutBrowser,
  type ShopCheckoutBrowserPort,
} from '@/shop/destination/openShopCheckoutBrowser';
import {purchaseShopProduct} from '@/shop/destination/openProductDestination';
import * as checkoutModule from '@/shop/shopify/createShopifyCheckout';
import {buildGymlyCartAttributes} from '@/shop/shopify/gymlyCheckoutAttribution';
import {getShopifyStorefrontConfig} from '@/config/shopifyConfig';
import type {ShopProduct, ShopProductVariant} from '@/types/shop.types';
import {redactExternalUrlForLog} from '@/shop/destination/openExternalHttpsUrl';

jest.mock('react-native', () => ({
  Alert: {alert: jest.fn()},
  Linking: {
    canOpenURL: jest.fn(async () => true),
    openURL: jest.fn(async () => undefined),
  },
  Platform: {OS: 'ios', select: (o: {ios?: unknown}) => o.ios},
}));

jest.mock('react-native-inappbrowser-reborn', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(async () => true),
    open: jest.fn(async () => ({type: 'dismiss'})),
    close: jest.fn(),
  },
}));

jest.mock('@/i18n/runtimeLanguage', () => ({
  rt: (key: string) => key,
  getRuntimeLanguage: () => 'en',
}));

jest.mock('@/config/shopifyConfig', () => {
  const actual = jest.requireActual('@/config/shopifyConfig');
  return {
    ...actual,
    getShopifyStorefrontConfig: jest.fn(),
  };
});

const mockGetConfig = getShopifyStorefrontConfig as jest.MockedFunction<
  typeof getShopifyStorefrontConfig
>;

const CHECKOUT_URL =
  'https://shop.gymlyapp.com/cart/c/test-checkout?key=secret-session-token';

const VARIANT: ShopProductVariant = {
  id: 'gid://shopify/ProductVariant/59060233306457',
  title: 'Default Title',
  available: true,
  price: 199,
  compareAtPrice: null,
  selectedOptions: [],
};

const STORE_CONFIG = {
  storeDomain: 'f08uqq-vy.myshopify.com',
  storefrontPublicToken: 'test-public-token',
  apiVersion: '2026-04',
  graphqlUrl: 'https://f08uqq-vy.myshopify.com/api/2026-04/graphql.json',
};

function gymlyProduct(overrides: Partial<ShopProduct> = {}): ShopProduct {
  return {
    id: 'gid://shopify/Product/16522360226137',
    handle: 'creatine-monohydrate-300-g',
    title: 'Creatine Monohydrate – 300 g',
    description: 'Demo',
    brand: 'Gymly demo',
    brandId: 'vendor:gymly_demo',
    category: 'supplements',
    tags: [],
    images: ['https://cdn.shopify.com/s/files/1/creatine.jpg'],
    price: 199,
    compareAtPrice: null,
    currencyCode: 'DKK',
    variants: [VARIANT],
    salesModel: 'gymly',
    destinationUrl: 'https://f08uqq-vy.myshopify.com/products/creatine',
    affiliateNetwork: null,
    affiliateTrackingStatus: null,
    featured: false,
    popular: false,
    available: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    onlineStoreUrl: 'https://f08uqq-vy.myshopify.com/products/creatine',
    ...overrides,
  };
}

const purchaseContext = {
  productId: 'gid://shopify/Product/16522360226137',
  brand: 'Gymly demo',
  category: 'supplements' as const,
  salesModel: 'gymly' as const,
  placement: 'product_detail' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  checkoutModule.resetShopifyCheckoutInFlightForTests();
  mockGetConfig.mockReturnValue({ok: true, config: STORE_CONFIG});
});

describe('openShopCheckoutBrowser', () => {
  it('opens checkout in the native in-app browser when available', async () => {
    const port: ShopCheckoutBrowserPort = {
      isInAppAvailable: jest.fn(async () => true),
      openInApp: jest.fn(async () => 'dismissed'),
      openExternal: jest.fn(async () => {
        throw new Error('should not external');
      }),
    };

    const result = await openShopCheckoutBrowser(CHECKOUT_URL, port);
    expect(result).toEqual({
      ok: true,
      method: 'in_app',
      dismissed: true,
    });
    expect(port.openInApp).toHaveBeenCalledWith(CHECKOUT_URL);
    expect(port.openExternal).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('treats in-app dismiss as return to Gymly (same product screen)', async () => {
    const port: ShopCheckoutBrowserPort = {
      isInAppAvailable: async () => true,
      openInApp: async () => 'dismissed',
      openExternal: jest.fn(),
    };
    const result = await openShopCheckoutBrowser(CHECKOUT_URL, port);
    expect(result.ok && result.method === 'in_app' && result.dismissed).toBe(
      true,
    );
  });

  it('falls back to the system browser when in-app is unavailable', async () => {
    const port: ShopCheckoutBrowserPort = {
      isInAppAvailable: jest.fn(async () => false),
      openInApp: jest.fn(async () => 'dismissed'),
      openExternal: jest.fn(async () => undefined),
    };
    const result = await openShopCheckoutBrowser(CHECKOUT_URL, port);
    expect(result).toEqual({ok: true, method: 'external'});
    expect(port.openInApp).not.toHaveBeenCalled();
    expect(port.openExternal).toHaveBeenCalledWith(CHECKOUT_URL);
  });

  it('falls back to system browser when in-app open throws', async () => {
    const port: ShopCheckoutBrowserPort = {
      isInAppAvailable: async () => true,
      openInApp: async () => {
        throw new Error('safari failed');
      },
      openExternal: jest.fn(async () => undefined),
    };
    const result = await openShopCheckoutBrowser(CHECKOUT_URL, port);
    expect(result).toEqual({ok: true, method: 'external'});
    expect(port.openExternal).toHaveBeenCalled();
  });

  it('alerts when both browser methods fail', async () => {
    const port: ShopCheckoutBrowserPort = {
      isInAppAvailable: async () => true,
      openInApp: async () => {
        throw new Error('in-app failed');
      },
      openExternal: async () => {
        throw new Error('external failed');
      },
    };
    const result = await openShopCheckoutBrowser(CHECKOUT_URL, port);
    expect(result).toEqual({ok: false, reason: 'open_failed'});
    expect(Alert.alert).toHaveBeenCalledWith(
      'shop.errors.destinationTitle',
      'shop.errors.checkoutBrowserUnavailable',
    );
  });

  it('redacts checkout query tokens from log-safe URLs', () => {
    const redacted = redactExternalUrlForLog(CHECKOUT_URL);
    expect(redacted).toBe('https://shop.gymlyapp.com/cart/c/test-checkout');
    expect(redacted).not.toContain('secret');
  });
});

describe('purchaseShopProduct + in-app checkout', () => {
  it('creates cart then opens the exact checkout URL in-app', async () => {
    const createSpy = jest
      .spyOn(checkoutModule, 'createShopifyCheckout')
      .mockResolvedValue({
        cartId: 'gid://shopify/Cart/1',
        checkoutUrl: CHECKOUT_URL,
      });
    const port: ShopCheckoutBrowserPort = {
      isInAppAvailable: async () => true,
      openInApp: jest.fn(async (url: string) => {
        expect(url).toBe(CHECKOUT_URL);
        return 'dismissed';
      }),
      openExternal: jest.fn(),
    };

    const result = await purchaseShopProduct({
      product: gymlyProduct(),
      variant: VARIANT,
      context: purchaseContext,
      checkoutBrowser: port,
    });

    expect(result).toEqual({ok: true, method: 'in_app'});
    expect(createSpy).toHaveBeenCalledWith(
      STORE_CONFIG,
      expect.objectContaining({
        variantId: VARIANT.id,
        attribution: expect.objectContaining({
          productId: gymlyProduct().id,
          variantId: VARIANT.id,
          vendor: 'Gymly demo',
          productHandle: 'creatine-monohydrate-300-g',
        }),
      }),
    );
    expect(port.openInApp).toHaveBeenCalledTimes(1);
  });

  it('keeps Gymly cart attribution attributes unchanged', () => {
    const attrs = buildGymlyCartAttributes({
      productId: gymlyProduct().id,
      variantId: VARIANT.id,
      vendor: 'Gymly demo',
      productHandle: 'creatine-monohydrate-300-g',
    });
    expect(attrs.map(a => a.key)).toEqual(
      expect.arrayContaining([
        'gymly_sales_source',
        'gymly_product_id',
        'gymly_variant_id',
        'gymly_vendor',
        'gymly_product_handle',
      ]),
    );
  });

  it('dedupes concurrent cartCreate for the same variant (double-tap)', async () => {
    let resolveRequest!: (v: unknown) => void;
    const request = jest.fn(
      () =>
        new Promise(resolve => {
          resolveRequest = resolve;
        }),
    );
    const input = {
      variantId: VARIANT.id,
      attribution: {
        productId: 'p',
        variantId: VARIANT.id,
        vendor: 'Gymly demo',
      },
    };
    const client = {request} as never;
    const p1 = checkoutModule.createShopifyCheckout(
      STORE_CONFIG,
      input,
      client,
    );
    const p2 = checkoutModule.createShopifyCheckout(
      STORE_CONFIG,
      input,
      client,
    );
    expect(request).toHaveBeenCalledTimes(1);
    resolveRequest({
      cartCreate: {
        cart: {id: 'gid://shopify/Cart/1', checkoutUrl: CHECKOUT_URL},
        userErrors: [],
      },
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.checkoutUrl).toBe(CHECKOUT_URL);
    expect(b.checkoutUrl).toBe(CHECKOUT_URL);
  });
});
