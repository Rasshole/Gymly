/**
 * Gymly Shop — hybrid catalogue model (affiliate + gymly).
 * Replaceable by Shopify/Supabase mapping in a later phase.
 */

export type ShopSalesModel = 'affiliate' | 'gymly';

/**
 * Affiliate commission tracking readiness.
 * - configured: partner-approved tracked HTTPS URL (purchase allowed)
 * - untracked: plain product URL without tracking evidence (not commission-enabled)
 * - unavailable: missing or invalid destination
 * Null for Gymly/Shopify checkout products.
 */
export type ShopAffiliateTrackingStatus =
  | 'configured'
  | 'untracked'
  | 'unavailable';

export type ShopCategoryId =
  | 'activewear'
  | 'equipment'
  | 'supplements'
  | 'recovery'
  | 'accessories';

export type ShopProductSort =
  | 'featured'
  | 'price_asc'
  | 'price_desc';

export type ShopProductVariant = {
  id: string;
  title: string;
  available: boolean;
  /** Optional variant price override (same currency as product). */
  price?: number;
  compareAtPrice?: number | null;
  selectedOptions?: Array<{name: string; value: string}>;
};

export type ShopBrand = {
  id: string;
  name: string;
  /** Optional local asset key — real logos arrive with Shopify media later. */
  logoKey?: string;
};

export type ShopProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  brand: string;
  brandId: string;
  category: ShopCategoryId;
  tags: string[];
  /**
   * Shopify CDN image URLs (HTTPS). Empty → neutral Gymly fallback (no letter avatar).
   */
  images: string[];
  /** Amount in major currency units (e.g. 299.00 DKK). */
  price: number;
  compareAtPrice: number | null;
  /** ISO 4217 from Shopify — never invent currency. */
  currencyCode: string;
  variants: ShopProductVariant[];
  salesModel: ShopSalesModel;
  /**
   * Exact partner destination when salesModel is affiliate.
   * Must be the approved tracked HTTPS URL — never invent tracking params.
   * Empty when tracking status is not configured.
   */
  destinationUrl: string;
  affiliateNetwork: string | null;
  /**
   * Affiliate attribution readiness. Null for Gymly-sold products.
   * Public affiliate CTAs require `configured`.
   */
  affiliateTrackingStatus: ShopAffiliateTrackingStatus | null;
  featured: boolean;
  popular: boolean;
  available: boolean;
  createdAt: string;
  updatedAt: string;
  /** Shopify online store URL when available (Gymly products). */
  onlineStoreUrl?: string | null;
  /**
   * Optional ISO-8601 timestamp when partner price was last verified
   * (`custom.gymly_price_verified_at`). Display-only; never invents a value.
   */
  priceVerifiedAt?: string | null;
};

export type ShopDestinationPlacement =
  | 'product_detail'
  | 'product_card'
  | 'featured'
  | 'recommended'
  | 'search'
  | 'category'
  | 'saved';

export type ShopDestinationContext = {
  productId: string;
  brand: string;
  category: ShopCategoryId;
  salesModel: ShopSalesModel;
  placement: ShopDestinationPlacement;
};

export type ShopCatalogPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type ShopCatalogPage = {
  products: ShopProduct[];
  pageInfo: ShopCatalogPageInfo;
};

export type ShopCatalogQuery = {
  categoryId?: ShopCategoryId;
  brandId?: string;
  search?: string;
  sort?: ShopProductSort;
  featuredOnly?: boolean;
  popularOnly?: boolean;
  ids?: readonly string[];
  /** Cursor pagination (Shopify connections). */
  first?: number;
  after?: string;
};
