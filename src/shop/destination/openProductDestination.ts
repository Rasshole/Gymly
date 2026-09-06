/**
 * Unified purchase entry — Gymly Shopify checkout or validated affiliate URL.
 * Affiliate: only partner-approved tracked URLs (preserve query params; never invent them).
 * Gymly: cartCreate with non-sensitive sales-source attributes for vendor reconciliation.
 */
import {Alert} from 'react-native';
import type {ShopDestinationContext, ShopProduct, ShopProductVariant} from '@/types/shop.types';
import {validateProductDestinationUrl} from './validateProductDestinationUrl';
import {openExternalHttpsUrl} from './openExternalHttpsUrl';
import {
  openShopCheckoutBrowser,
  type ShopCheckoutBrowserPort,
} from './openShopCheckoutBrowser';
import {
  isAffiliatePurchaseAllowed,
} from './affiliateTracking';
import {rt, getRuntimeLanguage} from '@/i18n/runtimeLanguage';
import {getShopifyStorefrontConfig} from '@/config/shopifyConfig';
import {createShopifyCheckout} from '@/shop/shopify/createShopifyCheckout';
import {isShopError} from '@/shop/shopify/shopErrors';
import {isAffiliateCtaDisabled} from '@/shop/shopify/mapShopifyProduct';

export type OpenProductDestinationResult =
  | {ok: true; method?: 'in_app' | 'external'}
  | {ok: false; reason: string};

/** Affiliate destinations stay on the system browser (partner sites). */
async function openHttpsUrl(url: string): Promise<OpenProductDestinationResult> {
  const result = await openExternalHttpsUrl(url);
  if (result.ok) {
    return {ok: true, method: 'external'};
  }
  return {ok: false, reason: result.reason};
}

function affiliateBlockedMessage(product: ShopProduct): string {
  if (product.affiliateTrackingStatus === 'untracked') {
    return rt('shop.errors.affiliateUntracked');
  }
  return rt('shop.errors.affiliateUnavailable');
}

/**
 * Affiliate outbound open — HTTPS + configured tracking only.
 * Preserves tracking query parameters; does not append invented ones.
 */
export async function openProductDestination(
  product: ShopProduct,
  _context: ShopDestinationContext,
): Promise<OpenProductDestinationResult> {
  if (product.salesModel === 'affiliate') {
    if (!isAffiliatePurchaseAllowed(product.affiliateTrackingStatus)) {
      Alert.alert(rt('shop.errors.destinationTitle'), affiliateBlockedMessage(product));
      return {ok: false, reason: 'affiliate_not_configured'};
    }
    // Use the already-approved destination on the product — preserve tracking params.
    // Do not re-classify tracking here (partner-marked links may lack common param names).
    const validated = validateProductDestinationUrl(product.destinationUrl);
    if (!validated.ok) {
      Alert.alert(rt('shop.errors.destinationTitle'), rt('shop.errors.affiliateUnavailable'));
      return {ok: false, reason: 'unavailable'};
    }
    return openHttpsUrl(validated.url);
  }

  const validated = validateProductDestinationUrl(product.destinationUrl);
  if (!validated.ok) {
    Alert.alert(rt('shop.errors.destinationTitle'), rt('shop.errors.destinationInvalid'));
    return {ok: false, reason: validated.reason};
  }
  return openHttpsUrl(validated.url);
}

export type PurchaseShopProductInput = {
  product: ShopProduct;
  variant: ShopProductVariant | null;
  context: ShopDestinationContext;
  /** Test seam for SFSafariView / Custom Tabs vs system browser. */
  checkoutBrowser?: ShopCheckoutBrowserPort;
};

/**
 * Gymly products → cartCreate + validated checkout URL (with attribution attributes)
 * opened in the native in-app browser (SFSafariViewController / Chrome Custom Tabs).
 * Affiliate products → tracked partner URL only (system browser).
 * Opening checkout does not mean the order succeeded.
 * Does not confirm affiliate commission without a configured tracked link.
 */
export async function purchaseShopProduct(
  input: PurchaseShopProductInput,
): Promise<OpenProductDestinationResult> {
  const {product, variant, context, checkoutBrowser} = input;

  if (product.salesModel === 'affiliate') {
    return openProductDestination(product, context);
  }

  if (!product.available) {
    Alert.alert(rt('shop.errors.title'), rt('shop.errors.soldOut'));
    return {ok: false, reason: 'sold_out'};
  }

  const selected =
    variant ??
    product.variants.find(v => v.available) ??
    product.variants[0] ??
    null;

  if (!selected) {
    Alert.alert(rt('shop.errors.title'), rt('shop.errors.selectVariant'));
    return {ok: false, reason: 'missing_variant'};
  }

  if (!selected.available) {
    Alert.alert(rt('shop.errors.title'), rt('shop.errors.soldOut'));
    return {ok: false, reason: 'variant_sold_out'};
  }

  const cfg = getShopifyStorefrontConfig();
  if (!cfg.ok) {
    Alert.alert(rt('shop.errors.title'), rt('shop.errors.missingConfig'));
    return {ok: false, reason: 'missing_config'};
  }

  try {
    const {checkoutUrl} = await createShopifyCheckout(cfg.config, {
      variantId: selected.id,
      quantity: 1,
      languageCode: getRuntimeLanguage(),
      countryCode: 'DK',
      attribution: {
        productId: product.id,
        variantId: selected.id,
        vendor: product.brand,
        productHandle: product.handle,
      },
    });
    const opened = await openShopCheckoutBrowser(checkoutUrl, checkoutBrowser);
    if (!opened.ok) {
      return {ok: false, reason: opened.reason};
    }
    return {ok: true, method: opened.method};
  } catch (err) {
    const key = isShopError(err) ? err.userMessageKey : 'shop.errors.checkoutFailed';
    Alert.alert(rt('shop.errors.title'), rt(key));
    return {ok: false, reason: 'checkout_failed'};
  }
}

export function buildShopCtaLabel(
  product: ShopProduct,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  if (product.salesModel === 'gymly') {
    return t('shop.cta.buyNow');
  }
  return t('shop.cta.viewAtBrand', {brand: product.brand});
}

export function buildShopCtaHint(
  product: ShopProduct,
  t: (key: string) => string,
): string {
  if (product.salesModel === 'gymly') {
    return t('shop.cta.gymlyHint');
  }
  if (product.affiliateTrackingStatus === 'untracked') {
    return t('shop.errors.affiliateUntracked');
  }
  if (!isAffiliatePurchaseAllowed(product.affiliateTrackingStatus)) {
    return t('shop.errors.affiliateUnavailable');
  }
  // Do not claim commission attribution is confirmed — only that checkout is on the brand site.
  return t('shop.cta.affiliateHint');
}

export function isShopPurchaseDisabled(product: ShopProduct): boolean {
  if (product.salesModel === 'affiliate') {
    return isAffiliateCtaDisabled(product);
  }
  if (!product.available) {
    return true;
  }
  return !product.variants.some(v => v.available);
}
