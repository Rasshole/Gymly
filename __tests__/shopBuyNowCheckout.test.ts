/**
 * Buy now → cartCreate → open HTTPS checkout (native UI path).
 * Never contacts live Shopify; never embeds Storefront tokens.
 */
import {Alert, Linking} from 'react-native';
import type {ShopProduct, ShopProductVariant} from '@/types/shop.types';
import {purchaseShopProduct} from '@/shop/destination/openProductDestination';
import {
  openExternalHttpsUrl,
  redactExternalUrlForLog,
} from '@/shop/destination/openExternalHttpsUrl';
import * as checkoutModule from '@/shop/shopify/createShopifyCheckout';
import {ShopifyStorefrontClient} from '@/shop/shopify/ShopifyStorefrontClient';
import {buildGymlyCartAttributes} from '@/shop/shopify/gymlyCheckoutAttribution';
import {getShopifyStorefrontConfig} from '@/config/shopifyConfig';
import {ShopError} from '@/shop/shopify/shopErrors';

jest.mock('react-native', () => ({
  Alert: {alert: jest.fn()},
  Linking: {
    canOpenURL: jest.fn(async () => false),
    openURL: jest.fn(async () => undefined),
  },
  Platform: {OS: 'ios', select: (o: {ios?: unknown}) => o.ios},
}));

jest.mock('react-native-inappbrowser-reborn', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(async () => false),
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
  (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
  (Linking.openURL as jest.Mock).mockResolvedValue(undefined);
});

describe('openExternalHttpsUrl', () => {
  it('opens HTTPS even when canOpenURL returns false', async () => {
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    const result = await openExternalHttpsUrl(CHECKOUT_URL);
    expect(result).toEqual({ok: true});
    expect(Linking.openURL).toHaveBeenCalledWith(CHECKOUT_URL);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('alerts when Linking.openURL rejects', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('blocked'));
    const result = await openExternalHttpsUrl(CHECKOUT_URL);
    expect(result.ok).toBe(false);
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('rejects non-HTTPS destinations', async () => {
    const result = await openExternalHttpsUrl('http://example.com/checkout');
    expect(result.ok).toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('redacts query tokens from log-safe URLs', () => {
    const redacted = redactExternalUrlForLog(CHECKOUT_URL);
    expect(redacted).toBe('https://shop.gymlyapp.com/cart/c/test-checkout');
    expect(redacted).not.toContain('secret');
  });
});

describe('purchaseShopProduct (Gymly Buy now)', () => {
  it('creates a cart and opens the checkout URL', async () => {
    const createSpy = jest
      .spyOn(checkoutModule, 'createShopifyCheckout')
      .mockResolvedValue({
        cartId: 'gid://shopify/Cart/1',
        checkoutUrl: CHECKOUT_URL,
      });

    const result = await purchaseShopProduct({
      product: gymlyProduct(),
      variant: VARIANT,
      context: purchaseContext,
    });

    expect(result).toEqual({ok: true, method: 'external'});
    expect(createSpy).toHaveBeenCalledWith(
      STORE_CONFIG,
      expect.objectContaining({
        variantId: VARIANT.id,
        quantity: 1,
        attribution: expect.objectContaining({
          productId: gymlyProduct().id,
          variantId: VARIANT.id,
          vendor: 'Gymly demo',
          productHandle: 'creatine-monohydrate-300-g',
        }),
      }),
    );
    expect(Linking.openURL).toHaveBeenCalledWith(CHECKOUT_URL);
  });

  it('uses the default available variant when none is selected', async () => {
    const createSpy = jest
      .spyOn(checkoutModule, 'createShopifyCheckout')
      .mockResolvedValue({
        cartId: 'gid://shopify/Cart/1',
        checkoutUrl: CHECKOUT_URL,
      });

    await purchaseShopProduct({
      product: gymlyProduct(),
      variant: null,
      context: purchaseContext,
    });

    expect(createSpy).toHaveBeenCalledWith(
      STORE_CONFIG,
      expect.objectContaining({variantId: VARIANT.id}),
    );
  });

  it('alerts when no variant exists', async () => {
    const result = await purchaseShopProduct({
      product: gymlyProduct({variants: [], available: true}),
      variant: null,
      context: purchaseContext,
    });
    expect(result).toEqual({ok: false, reason: 'missing_variant'});
    expect(Alert.alert).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('alerts when cartCreate fails', async () => {
    jest.spyOn(checkoutModule, 'createShopifyCheckout').mockRejectedValue(
      new ShopError('cart', 'shop.errors.checkoutFailed', 'Cart user error'),
    );

    const result = await purchaseShopProduct({
      product: gymlyProduct(),
      variant: VARIANT,
      context: purchaseContext,
    });

    expect(result.ok).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith(
      'shop.errors.title',
      'shop.errors.checkoutFailed',
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('rejects missing checkout URL from cartCreate', async () => {
    const request = jest.fn(async () => ({
      cartCreate: {
        cart: {id: 'gid://shopify/Cart/1', checkoutUrl: null},
        userErrors: [],
      },
    }));
    await expect(
      checkoutModule.createShopifyCheckout(
        STORE_CONFIG,
        {
          variantId: VARIANT.id,
          attribution: {
            productId: 'p',
            variantId: VARIANT.id,
            vendor: 'Gymly demo',
          },
        },
        {request} as unknown as ShopifyStorefrontClient,
      ),
    ).rejects.toMatchObject({userMessageKey: 'shop.errors.checkoutFailed'});
  });

  it('alerts when native URL opening fails after a valid cart', async () => {
    jest.spyOn(checkoutModule, 'createShopifyCheckout').mockResolvedValue({
      cartId: 'gid://shopify/Cart/1',
      checkoutUrl: CHECKOUT_URL,
    });
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('cannot open'));

    const result = await purchaseShopProduct({
      product: gymlyProduct(),
      variant: VARIANT,
      context: purchaseContext,
    });

    expect(result).toEqual({ok: false, reason: 'open_failed'});
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('dedupes concurrent cartCreate for the same variant', async () => {
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
    const client = {request} as unknown as ShopifyStorefrontClient;
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

  it('keeps Gymly attribution attributes on the cart', () => {
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
    expect(attrs.find(a => a.key === 'gymly_sales_source')?.value).toBe(
      'gymly_app_ios',
    );
  });

  it('does not block Gymly Buy now on affiliate tracking status', async () => {
    jest.spyOn(checkoutModule, 'createShopifyCheckout').mockResolvedValue({
      cartId: 'gid://shopify/Cart/1',
      checkoutUrl: CHECKOUT_URL,
    });

    const result = await purchaseShopProduct({
      product: gymlyProduct({affiliateTrackingStatus: 'untracked'}),
      variant: VARIANT,
      context: purchaseContext,
    });

    expect(result).toEqual({ok: true, method: 'external'});
    expect(Linking.openURL).toHaveBeenCalled();
  });
});
