/**
 * Affiliate tracking readiness — commission attribution requires a partner-approved tracked URL.
 * Never invents tracking parameters or commission rates.
 */
import type {ShopAffiliateTrackingStatus} from '@/types/shop.types';
import {validateProductDestinationUrl} from '@/shop/destination/validateProductDestinationUrl';

/**
 * Query keys commonly present on partner-approved tracked affiliate links.
 * Presence of at least one (case-insensitive) indicates a tracked destination.
 * Plain product URLs without these are treated as untracked (not commission-enabled).
 */
const AFFILIATE_TRACKING_QUERY_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'aff_id',
  'affiliate_id',
  'affiliateid',
  'partner_id',
  'partnerid',
  'click_id',
  'clickid',
  'irclickid',
  'ranmid',
  'raneid',
  'sharedid',
  'subid',
  'sub_id',
  'tracking_id',
  'trackingid',
  'awc',
  'epid',
  'epik',
  'ref',
  'referral',
]);

export function affiliateUrlHasTrackingParams(url: string): boolean {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (AFFILIATE_TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves affiliate tracking status for commerce attribution.
 *
 * - configured: valid HTTPS URL that is partner-approved tracked
 *   (has tracking query params, or explicit Storefront metafield assertion)
 * - untracked: valid HTTPS URL but no tracking evidence → not commission-enabled
 * - unavailable: missing / invalid / insecure destination
 *
 * Does not invent parameters. Does not infer commission rates.
 */
export function resolveAffiliateTrackingStatus(
  rawUrl: string | null | undefined,
  options: {partnerMarkedTracked?: boolean} = {},
): ShopAffiliateTrackingStatus {
  const validated = validateProductDestinationUrl(rawUrl);
  if (!validated.ok) {
    return 'unavailable';
  }
  if (options.partnerMarkedTracked) {
    return 'configured';
  }
  if (affiliateUrlHasTrackingParams(validated.url)) {
    return 'configured';
  }
  return 'untracked';
}

/** Public purchase is only allowed when tracking is explicitly configured. */
export function isAffiliatePurchaseAllowed(
  status: ShopAffiliateTrackingStatus | null | undefined,
): boolean {
  return status === 'configured';
}

/**
 * Returns the partner URL unchanged aside from HTTPS validation.
 * Preserves all tracking query parameters; never appends invented ones.
 */
export function resolveApprovedAffiliateDestinationUrl(
  rawUrl: string | null | undefined,
): {ok: true; url: string} | {ok: false; status: ShopAffiliateTrackingStatus} {
  const status = resolveAffiliateTrackingStatus(rawUrl);
  if (status !== 'configured') {
    return {ok: false, status};
  }
  const validated = validateProductDestinationUrl(rawUrl);
  if (!validated.ok) {
    return {ok: false, status: 'unavailable'};
  }
  return {ok: true, url: validated.url};
}
