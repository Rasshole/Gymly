/**
 * Gymly web shop — partner-brand outbound purchase decisioning.
 * Reuses the app’s metafield contract and destination validators.
 * Never invents tracking params, never falls affiliate → Gymly checkout.
 */
import type {ShopAffiliateTrackingStatus, ShopSalesModel} from '@/types/shop.types';
import {
  isAffiliatePurchaseAllowed,
  resolveAffiliateTrackingStatus,
} from '@/shop/destination/affiliateTracking';
import {validateProductDestinationUrl} from '@/shop/destination/validateProductDestinationUrl';
import {resolveSalesModel} from '@/shop/shopify/mapShopifyProduct';

export const GYMLY_WEB_SALES_SOURCE = 'gymly_web_shop' as const;

export type WebShopAffiliateProductInput = {
  /** Shopify product GID or numeric id string. */
  productId: string;
  handle: string;
  /** Partner brand display name (Shopify Vendor). */
  brand: string;
  /** Raw `custom.gymly_destination_type` metafield. */
  destinationTypeRaw?: string | null;
  /** Raw `custom.gymly_affiliate_url` — exact tracked URL when affiliate. */
  affiliateUrlRaw?: string | null;
  /** Raw `custom.gymly_affiliate_tracked` assertion. */
  affiliateTrackedRaw?: string | null;
  /** Optional `custom.gymly_price_verified_at`. */
  priceVerifiedAt?: string | null;
  /** Selected variant GID when known. */
  variantId?: string | null;
};

export type WebShopPurchaseUiState =
  | {
      salesModel: 'gymly';
      allowGymlyCart: true;
      allowOutbound: false;
      ctaEnabled: false;
      affiliateTrackingStatus: null;
      destinationUrl: null;
      destinationHostname: null;
    }
  | {
      salesModel: 'affiliate';
      allowGymlyCart: false;
      allowOutbound: boolean;
      ctaEnabled: boolean;
      affiliateTrackingStatus: ShopAffiliateTrackingStatus;
      destinationUrl: string | null;
      destinationHostname: string | null;
      unavailableReason:
        | 'missing_url'
        | 'untracked'
        | 'unavailable'
        | 'unsafe_url'
        | null;
    };

function isTruthyMetafield(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolve purchase UI for Online Store product pages.
 * Gymly-owned products keep cart/checkout. Affiliate never enters Gymly cart.
 */
export function resolveWebShopPurchaseUi(
  input: WebShopAffiliateProductInput,
): WebShopPurchaseUiState {
  const salesModel: ShopSalesModel = resolveSalesModel(input.destinationTypeRaw);

  if (salesModel === 'gymly') {
    return {
      salesModel: 'gymly',
      allowGymlyCart: true,
      allowOutbound: false,
      ctaEnabled: false,
      affiliateTrackingStatus: null,
      destinationUrl: null,
      destinationHostname: null,
    };
  }

  const partnerMarkedTracked = isTruthyMetafield(input.affiliateTrackedRaw);
  const status = resolveAffiliateTrackingStatus(input.affiliateUrlRaw, {
    partnerMarkedTracked,
  });

  if (status === 'configured') {
    const validated = validateProductDestinationUrl(input.affiliateUrlRaw);
    if (!validated.ok) {
      return {
        salesModel: 'affiliate',
        allowGymlyCart: false,
        allowOutbound: false,
        ctaEnabled: false,
        affiliateTrackingStatus: 'unavailable',
        destinationUrl: null,
        destinationHostname: null,
        unavailableReason: 'unsafe_url',
      };
    }
    return {
      salesModel: 'affiliate',
      allowGymlyCart: false,
      allowOutbound: true,
      ctaEnabled: true,
      affiliateTrackingStatus: 'configured',
      destinationUrl: validated.url,
      destinationHostname: hostnameOf(validated.url),
      unavailableReason: null,
    };
  }

  if (status === 'untracked') {
    return {
      salesModel: 'affiliate',
      allowGymlyCart: false,
      allowOutbound: false,
      ctaEnabled: false,
      affiliateTrackingStatus: 'untracked',
      destinationUrl: null,
      destinationHostname: null,
      unavailableReason: 'untracked',
    };
  }

  const empty =
    input.affiliateUrlRaw == null || String(input.affiliateUrlRaw).trim() === '';
  return {
    salesModel: 'affiliate',
    allowGymlyCart: false,
    allowOutbound: false,
    ctaEnabled: false,
    affiliateTrackingStatus: 'unavailable',
    destinationUrl: null,
    destinationHostname: null,
    unavailableReason: empty ? 'missing_url' : 'unavailable',
  };
}

export type AffiliateOutboundClickEvent = {
  event: 'affiliate_outbound_click';
  gymly_product_id: string;
  shopify_product_id: string;
  shopify_variant_id: string | null;
  product_handle: string;
  partner_brand: string;
  destination_hostname: string;
  sales_source: typeof GYMLY_WEB_SALES_SOURCE;
  timestamp: string;
};

/**
 * Build first-party analytics payload. Never includes the full affiliate URL
 * (query params may contain sensitive click identifiers).
 */
export function buildAffiliateOutboundClickEvent(
  input: WebShopAffiliateProductInput,
  destinationHostname: string,
  timestamp: string = new Date().toISOString(),
): AffiliateOutboundClickEvent {
  return {
    event: 'affiliate_outbound_click',
    gymly_product_id: input.productId,
    shopify_product_id: input.productId,
    shopify_variant_id: input.variantId?.trim() || null,
    product_handle: input.handle,
    partner_brand: input.brand,
    destination_hostname: destinationHostname,
    sales_source: GYMLY_WEB_SALES_SOURCE,
    timestamp,
  };
}

export type AffiliateOutboundRecorder = (
  payload: AffiliateOutboundClickEvent,
) => void;

/**
 * Record outbound click then open the exact tracked URL in a new tab.
 * Does not delay navigation on a failed/slow recorder.
 */
export function openAffiliateOutboundPurchase(options: {
  input: WebShopAffiliateProductInput;
  record?: AffiliateOutboundRecorder;
  openUrl?: (url: string) => void;
}):
  | {ok: true; url: string; event: AffiliateOutboundClickEvent}
  | {ok: false; reason: string} {
  const ui = resolveWebShopPurchaseUi(options.input);
  if (ui.salesModel !== 'affiliate' || !ui.ctaEnabled || !ui.destinationUrl) {
    return {ok: false, reason: ui.salesModel === 'gymly' ? 'not_affiliate' : 'cta_disabled'};
  }

  const event = buildAffiliateOutboundClickEvent(
    options.input,
    ui.destinationHostname ?? 'unknown',
  );
  try {
    options.record?.(event);
  } catch {
    // Never block navigation on analytics failure.
  }

  const open =
    options.openUrl ??
    ((url: string) => {
      const g = globalThis as {
        open?: (url: string, target?: string, features?: string) => unknown;
      };
      if (typeof g.open === 'function') {
        g.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  open(ui.destinationUrl);
  return {ok: true, url: ui.destinationUrl, event};
}

export function isAffiliatePurchaseAllowedForWeb(
  status: ShopAffiliateTrackingStatus | null | undefined,
): boolean {
  return isAffiliatePurchaseAllowed(status);
}

/** Copy helpers — brand interpolation for web shop strings. */
export function formatWebShopBrandCopy(
  template: string,
  brand: string,
): string {
  return template.replace(/\{\{\s*brand\s*\}\}/gi, brand).replace(/%\{brand\}/gi, brand);
}
