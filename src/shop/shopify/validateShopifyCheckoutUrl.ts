/**
 * Validates Shopify checkout URLs before opening externally.
 */
import {
  isAllowedShopifyCheckoutHost,
  type ShopifyStorefrontConfig,
} from '@/config/shopifyConfig';
import {validateProductDestinationUrl} from '@/shop/destination/validateProductDestinationUrl';

export type CheckoutUrlValidation =
  | {ok: true; url: string}
  | {ok: false; reason: string};

export function validateShopifyCheckoutUrl(
  raw: string | null | undefined,
  config: Pick<ShopifyStorefrontConfig, 'storeDomain'>,
): CheckoutUrlValidation {
  const base = validateProductDestinationUrl(raw);
  if (!base.ok) {
    return {ok: false, reason: base.reason};
  }
  let host: string;
  try {
    host = new URL(base.url).hostname;
  } catch {
    return {ok: false, reason: 'invalid'};
  }
  if (!isAllowedShopifyCheckoutHost(host, config.storeDomain)) {
    return {ok: false, reason: 'host_not_allowed'};
  }
  return {ok: true, url: base.url};
}
