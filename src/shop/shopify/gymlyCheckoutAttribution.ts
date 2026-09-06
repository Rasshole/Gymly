/**
 * Non-sensitive cart / line attributes for Gymly Shopify checkout attribution.
 * Preserves vendor + product/variant IDs for later vendor-ledger reconciliation.
 * Does not implement partner payouts or expose commission rates.
 */
import {Platform} from 'react-native';

export type GymlyCheckoutAttribution = {
  productId: string;
  variantId: string;
  vendor: string;
  productHandle?: string;
};

export type ShopifyAttributeInput = {key: string; value: string};

export function buildGymlyCartAttributes(
  attribution: GymlyCheckoutAttribution,
): ShopifyAttributeInput[] {
  const source =
    Platform.OS === 'ios'
      ? 'gymly_app_ios'
      : Platform.OS === 'android'
        ? 'gymly_app_android'
        : 'gymly_app';

  return [
    {key: 'gymly_sales_source', value: source},
    {key: 'gymly_product_id', value: attribution.productId},
    {key: 'gymly_variant_id', value: attribution.variantId},
    {key: 'gymly_vendor', value: attribution.vendor.slice(0, 255)},
    ...(attribution.productHandle
      ? [{key: 'gymly_product_handle', value: attribution.productHandle.slice(0, 255)}]
      : []),
  ];
}

export function buildGymlyCartLineAttributes(
  attribution: GymlyCheckoutAttribution,
): ShopifyAttributeInput[] {
  return [
    {key: 'gymly_product_id', value: attribution.productId},
    {key: 'gymly_variant_id', value: attribution.variantId},
    {key: 'gymly_vendor', value: attribution.vendor.slice(0, 255)},
  ];
}
