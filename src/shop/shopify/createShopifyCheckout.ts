/**
 * Creates a Shopify cart for a single Gymly-sold variant and returns a validated checkout URL.
 * Guards against duplicate in-flight creates for the same variant.
 * Attaches non-sensitive Gymly sales-source attributes (no commission rates).
 */
import type {ShopifyStorefrontConfig} from '@/config/shopifyConfig';
import {
  ShopifyStorefrontClient,
  mapAppLanguageToStorefront,
  type StorefrontCountryCode,
} from './ShopifyStorefrontClient';
import {CART_CREATE_MUTATION} from './storefrontQueries';
import {ShopError} from './shopErrors';
import {validateShopifyCheckoutUrl} from './validateShopifyCheckoutUrl';
import {
  buildGymlyCartAttributes,
  buildGymlyCartLineAttributes,
  type GymlyCheckoutAttribution,
} from './gymlyCheckoutAttribution';

export type CreateCheckoutInput = {
  variantId: string;
  quantity?: number;
  languageCode?: string;
  countryCode?: StorefrontCountryCode;
  /** Required for revenue attribution to Gymly + vendor on the Shopify order. */
  attribution: GymlyCheckoutAttribution;
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
  cartId: string;
};

const inFlight = new Map<string, Promise<CreateCheckoutResult>>();

type CartCreateData = {
  cartCreate?: {
    cart?: {id?: string | null; checkoutUrl?: string | null} | null;
    userErrors?: Array<{message?: string | null; code?: string | null}> | null;
  } | null;
};

export async function createShopifyCheckout(
  config: ShopifyStorefrontConfig,
  input: CreateCheckoutInput,
  client: ShopifyStorefrontClient = new ShopifyStorefrontClient(config),
): Promise<CreateCheckoutResult> {
  const variantId = input.variantId?.trim();
  if (!variantId) {
    throw new ShopError(
      'checkout',
      'shop.errors.selectVariant',
      'Missing variant',
    );
  }

  const attribution: GymlyCheckoutAttribution = {
    ...input.attribution,
    variantId,
  };

  const key = `${config.storeDomain}:${variantId}`;
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<CreateCheckoutResult> => {
    const language = mapAppLanguageToStorefront(input.languageCode);
    const country = input.countryCode ?? 'DK';
    const data = await client.request<CartCreateData>(
      CART_CREATE_MUTATION,
      {
        input: {
          lines: [
            {
              merchandiseId: variantId,
              quantity: input.quantity ?? 1,
              attributes: buildGymlyCartLineAttributes(attribution),
            },
          ],
          attributes: buildGymlyCartAttributes(attribution),
          buyerIdentity: {
            countryCode: country,
          },
        },
        country,
        language,
      },
    );

    const payload = data.cartCreate;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length > 0) {
      throw new ShopError(
        'cart',
        'shop.errors.checkoutFailed',
        userErrors[0]?.message ?? 'Cart user error',
      );
    }

    const cartId = payload?.cart?.id;
    const checkoutUrl = payload?.cart?.checkoutUrl;
    if (!cartId || !checkoutUrl) {
      throw new ShopError(
        'checkout',
        'shop.errors.checkoutFailed',
        'Missing checkout URL',
      );
    }

    const validated = validateShopifyCheckoutUrl(checkoutUrl, config);
    if (!validated.ok) {
      throw new ShopError(
        'checkout',
        'shop.errors.checkoutFailed',
        `Invalid checkout URL: ${validated.reason}`,
      );
    }

    return {cartId, checkoutUrl: validated.url};
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/** Test helper — clears the duplicate-tap guard. */
export function resetShopifyCheckoutInFlightForTests(): void {
  inFlight.clear();
}
