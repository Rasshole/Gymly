/**
 * Maps Shopify Storefront product nodes → Gymly ShopProduct.
 * Never invents prices, stock, discounts, images, brands, variants,
 * tracking parameters, or commission rates.
 */
import type {
  ShopAffiliateTrackingStatus,
  ShopCategoryId,
  ShopProduct,
  ShopProductVariant,
  ShopSalesModel,
} from '@/types/shop.types';
import {isShopCategoryId} from '@/shop/catalog/shopCategories';
import {validateProductDestinationUrl} from '@/shop/destination/validateProductDestinationUrl';
import {
  isAffiliatePurchaseAllowed,
  resolveAffiliateTrackingStatus,
} from '@/shop/destination/affiliateTracking';

export type ShopifyMoney = {
  amount?: string | null;
  currencyCode?: string | null;
};

export type ShopifyImageNode = {
  url?: string | null;
  altText?: string | null;
};

export type ShopifyVariantNode = {
  id: string;
  title?: string | null;
  availableForSale?: boolean | null;
  selectedOptions?: Array<{name?: string | null; value?: string | null}> | null;
  price?: ShopifyMoney | null;
  compareAtPrice?: ShopifyMoney | null;
  image?: {url?: string | null} | null;
};

export type ShopifyMetafield = {value?: string | null} | null;

export type ShopifyProductNode = {
  id: string;
  handle?: string | null;
  title?: string | null;
  description?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[] | null;
  availableForSale?: boolean | null;
  onlineStoreUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  featuredImage?: ShopifyImageNode | null;
  images?: {nodes?: ShopifyImageNode[] | null} | null;
  priceRange?: {minVariantPrice?: ShopifyMoney | null} | null;
  compareAtPriceRange?: {minVariantPrice?: ShopifyMoney | null} | null;
  variants?: {nodes?: ShopifyVariantNode[] | null} | null;
  mfDestination?: ShopifyMetafield;
  mfAffiliate?: ShopifyMetafield;
  /** Optional merchant assertion that gymly_affiliate_url is the approved tracked link. */
  mfAffiliateTracked?: ShopifyMetafield;
  mfFeatured?: ShopifyMetafield;
  mfCategory?: ShopifyMetafield;
  mfSort?: ShopifyMetafield;
  /** Optional ISO date/time when partner display price was last verified. */
  mfPriceVerifiedAt?: ShopifyMetafield;
};

export type MappedShopProductExtras = {
  sortPriority: number;
};

function parseMoney(amount: string | null | undefined): number | null {
  if (amount == null || amount === '') {
    return null;
  }
  const n = Number.parseFloat(amount);
  return Number.isFinite(n) ? n : null;
}

function isTruthyMetafield(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function resolveSalesModel(
  destinationMetafield: string | null | undefined,
): ShopSalesModel {
  const v = (destinationMetafield ?? '').trim().toLowerCase();
  if (v === 'affiliate') {
    return 'affiliate';
  }
  // Absent, "gymly", or web alias "gymly_checkout" → Gymly Shopify checkout.
  // Safe default for ordinary Shopify products.
  return 'gymly';
}

export function resolveCategoryFromShopify(
  mfCategory: string | null | undefined,
  productType: string | null | undefined,
  tags: readonly string[] | null | undefined,
  collectionHint?: ShopCategoryId,
): ShopCategoryId {
  if (collectionHint) {
    return collectionHint;
  }
  const fromMf = (mfCategory ?? '').trim().toLowerCase();
  if (isShopCategoryId(fromMf)) {
    return fromMf;
  }
  const type = (productType ?? '').trim().toLowerCase();
  if (isShopCategoryId(type)) {
    return type;
  }
  for (const tag of tags ?? []) {
    const t = tag.trim().toLowerCase();
    if (isShopCategoryId(t)) {
      return t;
    }
  }
  return 'accessories';
}

export function mapShopifyVariant(
  node: ShopifyVariantNode,
): ShopProductVariant {
  const price = parseMoney(node.price?.amount);
  const compareAt = parseMoney(node.compareAtPrice?.amount);
  return {
    id: node.id,
    title: (node.title ?? '').trim() || 'Default',
    available: Boolean(node.availableForSale),
    price: price ?? undefined,
    compareAtPrice: compareAt,
    selectedOptions: (node.selectedOptions ?? [])
      .filter(o => o?.name && o?.value)
      .map(o => ({name: String(o!.name), value: String(o!.value)})),
  };
}

export function mapShopifyProduct(
  node: ShopifyProductNode,
  options: {collectionHint?: ShopCategoryId} = {},
): ShopProduct & MappedShopProductExtras {
  const brand = (node.vendor ?? '').trim() || 'Gymly';
  const brandId = `vendor:${brand.toLowerCase().replace(/\s+/g, '_')}`;
  const salesModel = resolveSalesModel(node.mfDestination?.value);
  const affiliateRaw = node.mfAffiliate?.value?.trim() ?? '';
  const partnerMarkedTracked = isTruthyMetafield(
    node.mfAffiliateTracked?.value,
  );

  let affiliateTrackingStatus: ShopAffiliateTrackingStatus | null = null;
  let destinationUrl = '';

  if (salesModel === 'affiliate') {
    affiliateTrackingStatus = resolveAffiliateTrackingStatus(affiliateRaw, {
      partnerMarkedTracked,
    });
    // Only expose destination when commission tracking is configured.
    // Never fall back to onlineStoreUrl (plain product pages are not commission-enabled).
    if (affiliateTrackingStatus === 'configured') {
      const validated = validateProductDestinationUrl(affiliateRaw);
      destinationUrl = validated.ok ? validated.url : '';
      if (!destinationUrl) {
        affiliateTrackingStatus = 'unavailable';
      }
    }
  } else {
    destinationUrl = (node.onlineStoreUrl ?? '').trim();
  }

  const imageUrls: string[] = [];
  const seen = new Set<string>();
  const pushUrl = (url: string | null | undefined) => {
    if (!url || seen.has(url) || url.includes('example.com')) {
      return;
    }
    seen.add(url);
    imageUrls.push(url);
  };
  pushUrl(node.featuredImage?.url);
  for (const img of node.images?.nodes ?? []) {
    pushUrl(img?.url);
  }

  const minPrice =
    parseMoney(node.priceRange?.minVariantPrice?.amount) ??
    parseMoney(node.variants?.nodes?.[0]?.price?.amount) ??
    0;
  const compareAt = parseMoney(
    node.compareAtPriceRange?.minVariantPrice?.amount,
  );
  const currencyCode =
    node.priceRange?.minVariantPrice?.currencyCode?.trim() ||
    node.variants?.nodes?.[0]?.price?.currencyCode?.trim() ||
    'DKK';

  const variants = (node.variants?.nodes ?? []).map(mapShopifyVariant);
  const sortPriority = Number.parseInt(node.mfSort?.value ?? '', 10);

  return {
    id: node.id,
    handle: (node.handle ?? '').trim(),
    title: (node.title ?? '').trim() || 'Product',
    description: (node.description ?? '').trim(),
    brand,
    brandId,
    category: resolveCategoryFromShopify(
      node.mfCategory?.value,
      node.productType,
      node.tags,
      options.collectionHint,
    ),
    tags: [...(node.tags ?? [])],
    images: imageUrls,
    price: minPrice,
    compareAtPrice:
      compareAt != null && compareAt > minPrice ? compareAt : null,
    currencyCode,
    variants,
    salesModel,
    destinationUrl,
    affiliateNetwork: salesModel === 'affiliate' ? brand : null,
    affiliateTrackingStatus,
    featured: isTruthyMetafield(node.mfFeatured?.value),
    popular: false,
    available: Boolean(node.availableForSale),
    createdAt: node.createdAt ?? new Date(0).toISOString(),
    updatedAt: node.updatedAt ?? new Date(0).toISOString(),
    onlineStoreUrl: node.onlineStoreUrl ?? null,
    priceVerifiedAt: node.mfPriceVerifiedAt?.value?.trim() || null,
    sortPriority: Number.isFinite(sortPriority) ? sortPriority : 0,
  };
}

export function stripMappedExtras(
  product: ShopProduct & MappedShopProductExtras,
): ShopProduct {
  const rest = {...product} as ShopProduct & Partial<MappedShopProductExtras>;
  delete rest.sortPriority;
  return rest as ShopProduct;
}

export function isAffiliateCtaDisabled(product: ShopProduct): boolean {
  if (product.salesModel !== 'affiliate') {
    return false;
  }
  return !isAffiliatePurchaseAllowed(product.affiliateTrackingStatus);
}
