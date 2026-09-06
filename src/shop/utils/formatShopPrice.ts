/** Default market currency when Shopify market pricing is unavailable. */
export const SHOP_FALLBACK_CURRENCY = 'DKK';

/**
 * Format a shop price with Intl.NumberFormat — never concatenate currency strings.
 */
export function formatShopPrice(
  amount: number,
  currencyCode: string | null | undefined,
  locale = 'da-DK',
): string {
  const code =
    currencyCode && /^[A-Z]{3}$/i.test(currencyCode.trim())
      ? currencyCode.trim().toUpperCase()
      : SHOP_FALLBACK_CURRENCY;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: SHOP_FALLBACK_CURRENCY,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

export function shopDiscountPercent(
  price: number,
  compareAtPrice: number | null | undefined,
): number | null {
  if (compareAtPrice == null || compareAtPrice <= price || price <= 0) {
    return null;
  }
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}
