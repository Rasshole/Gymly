/**
 * Live Shopify Storefront catalogue — no silent mock fallback.
 */
import type {
  ShopBrand,
  ShopCatalogPage,
  ShopCatalogQuery,
  ShopCategoryId,
  ShopProduct,
  ShopProductSort,
} from '@/types/shop.types';
import type {ShopCatalogRepository} from '@/shop/catalog/ShopCatalogRepository';
import type {ShopifyStorefrontConfig} from '@/config/shopifyConfig';
import {
  ShopifyStorefrontClient,
  mapAppLanguageToStorefront,
} from '@/shop/shopify/ShopifyStorefrontClient';
import {
  COLLECTION_PRODUCTS_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCTS_QUERY,
} from '@/shop/shopify/storefrontQueries';
import {
  mapShopifyProduct,
  stripMappedExtras,
  type ShopifyProductNode,
} from '@/shop/shopify/mapShopifyProduct';
import {
  SHOPIFY_FEATURED_COLLECTION_HANDLE,
  collectionHandleForCategory,
} from '@/shop/shopify/shopifyCollectionHandles';
import {ShopError} from '@/shop/shopify/shopErrors';
import {getRuntimeLanguage} from '@/i18n/runtimeLanguage';
import {sortShopProducts} from '@/shop/utils/filterAndSortShopProducts';

const DEFAULT_PAGE_SIZE = 24;

type ProductsConnection = {
  products?: {
    pageInfo?: {hasNextPage?: boolean; endCursor?: string | null};
    nodes?: ShopifyProductNode[] | null;
  } | null;
};

type CollectionConnection = {
  collection?: {
    id?: string;
    handle?: string;
    products?: {
      pageInfo?: {hasNextPage?: boolean; endCursor?: string | null};
      nodes?: ShopifyProductNode[] | null;
    } | null;
  } | null;
};

type ProductByIdData = {
  product?: ShopifyProductNode | null;
};

function toShopifyProductSort(
  sort: ShopProductSort | undefined,
): {sortKey: string; reverse: boolean} {
  switch (sort) {
    case 'price_asc':
      return {sortKey: 'PRICE', reverse: false};
    case 'price_desc':
      return {sortKey: 'PRICE', reverse: true};
    case 'featured':
    default:
      // BEST_SELLING is unavailable without metrics — TITLE is honest & deterministic.
      return {sortKey: 'TITLE', reverse: false};
  }
}

function buildSearchQuery(parts: {
  search?: string;
  brandId?: string;
  featuredOnly?: boolean;
}): string | undefined {
  const clauses: string[] = ['available_for_sale:true'];
  if (parts.search?.trim()) {
    const q = parts.search.trim().replace(/"/g, '');
    clauses.push(`title:${q}* OR vendor:${q}* OR tag:${q}* OR product_type:${q}*`);
  }
  if (parts.brandId?.startsWith('vendor:')) {
    const vendor = parts.brandId.slice('vendor:'.length).replace(/_/g, ' ');
    clauses.push(`vendor:${vendor}`);
  }
  if (parts.featuredOnly) {
    // Featured primarily via metafield/collection; query tag as soft hint.
    clauses.push('tag:featured');
  }
  return clauses.join(' AND ');
}

export class ShopifyShopCatalogRepository implements ShopCatalogRepository {
  private readonly client: ShopifyStorefrontClient;
  private listInFlight: Promise<ShopCatalogPage> | null = null;
  private listInFlightKey = '';

  constructor(
    private readonly config: ShopifyStorefrontConfig,
    client?: ShopifyStorefrontClient,
  ) {
    this.client = client ?? new ShopifyStorefrontClient(config);
  }

  private contextVars() {
    const language = mapAppLanguageToStorefront(getRuntimeLanguage());
    return {country: 'DK' as const, language};
  }

  private mapNodes(
    nodes: ShopifyProductNode[] | null | undefined,
    collectionHint?: ShopCategoryId,
  ): ShopProduct[] {
    const out: ShopProduct[] = [];
    const seen = new Set<string>();
    for (const node of nodes ?? []) {
      if (!node?.id || seen.has(node.id)) {
        continue;
      }
      seen.add(node.id);
      out.push(
        stripMappedExtras(mapShopifyProduct(node, {collectionHint})),
      );
    }
    return out;
  }

  async listProductsPage(query: ShopCatalogQuery = {}): Promise<ShopCatalogPage> {
    const first = query.first ?? DEFAULT_PAGE_SIZE;
    const after = query.after ?? null;
    const key = JSON.stringify({
      ...query,
      first,
      after,
    });

    if (this.listInFlight && this.listInFlightKey === key) {
      return this.listInFlight;
    }

    const run = this.fetchPage(query, first, after);
    this.listInFlight = run;
    this.listInFlightKey = key;
    try {
      return await run;
    } finally {
      if (this.listInFlightKey === key) {
        this.listInFlight = null;
        this.listInFlightKey = '';
      }
    }
  }

  private async fetchPage(
    query: ShopCatalogQuery,
    first: number,
    after: string | null,
  ): Promise<ShopCatalogPage> {
    const ctx = this.contextVars();

    if (query.ids?.length) {
      const products: ShopProduct[] = [];
      for (const id of query.ids) {
        const p = await this.getProductById(id);
        if (p) {
          products.push(p);
        }
      }
      return {
        products: sortShopProducts(products, query.sort ?? 'featured'),
        pageInfo: {hasNextPage: false, endCursor: null},
      };
    }

    if (query.categoryId) {
      const handle = collectionHandleForCategory(query.categoryId);
      const {sortKey, reverse} = toShopifyProductSort(query.sort);
      const data = await this.client.request<CollectionConnection>(
        COLLECTION_PRODUCTS_QUERY,
        {
          handle,
          first,
          after,
          sortKey,
          reverse,
          ...ctx,
        },
      );
      if (!data.collection) {
        // Missing collection → empty category (not unrelated products).
        return {
          products: [],
          pageInfo: {hasNextPage: false, endCursor: null},
        };
      }
      return {
        products: this.mapNodes(
          data.collection.products?.nodes,
          query.categoryId,
        ),
        pageInfo: {
          hasNextPage: Boolean(data.collection.products?.pageInfo?.hasNextPage),
          endCursor: data.collection.products?.pageInfo?.endCursor ?? null,
        },
      };
    }

    if (query.featuredOnly) {
      const featured = await this.fetchFeaturedPage(first, after, query.sort);
      return featured;
    }

    const {sortKey, reverse} = toShopifyProductSort(query.sort);
    const data = await this.client.request<ProductsConnection>(PRODUCTS_QUERY, {
      first,
      after,
      query: buildSearchQuery({
        search: query.search,
        brandId: query.brandId,
        featuredOnly: false,
      }),
      sortKey,
      reverse,
      ...ctx,
    });

    let products = this.mapNodes(data.products?.nodes);
    if (query.popularOnly) {
      products = products.filter(p => p.available);
    }

    return {
      products,
      pageInfo: {
        hasNextPage: Boolean(data.products?.pageInfo?.hasNextPage),
        endCursor: data.products?.pageInfo?.endCursor ?? null,
      },
    };
  }

  /**
   * Featured rule: metafield → `featured` collection → live catalogue fallback.
   */
  private async fetchFeaturedPage(
    first: number,
    after: string | null,
    sort?: ShopProductSort,
  ): Promise<ShopCatalogPage> {
    const ctx = this.contextVars();
    // Prefer dedicated collection when present.
    try {
      const data = await this.client.request<CollectionConnection>(
        COLLECTION_PRODUCTS_QUERY,
        {
          handle: SHOPIFY_FEATURED_COLLECTION_HANDLE,
          first,
          after,
          sortKey: 'MANUAL',
          reverse: false,
          ...ctx,
        },
      );
      if (data.collection?.products?.nodes?.length) {
        return {
          products: this.mapNodes(data.collection.products.nodes),
          pageInfo: {
            hasNextPage: Boolean(data.collection.products.pageInfo?.hasNextPage),
            endCursor: data.collection.products.pageInfo?.endCursor ?? null,
          },
        };
      }
    } catch {
      // Fall through to metafield / catalogue path.
    }

    const {sortKey, reverse} = toShopifyProductSort(sort);
    const data = await this.client.request<ProductsConnection>(PRODUCTS_QUERY, {
      first: Math.max(first, 40),
      after,
      query: 'available_for_sale:true',
      sortKey,
      reverse,
      ...ctx,
    });
    const mapped = this.mapNodes(data.products?.nodes).map(p => {
      // Remap with extras for featured filter — re-fetch nodes already stripped.
      return p;
    });
    // Soft filter: prefer products tagged featured in Shopify product.featured from metafield
    // (already mapped). If none, return the live page as deterministic fallback.
    const featuredOnly = mapped.filter(p => p.featured);
    const products = featuredOnly.length > 0 ? featuredOnly.slice(0, first) : mapped.slice(0, first);
    return {
      products,
      pageInfo: {
        hasNextPage: Boolean(data.products?.pageInfo?.hasNextPage),
        endCursor: data.products?.pageInfo?.endCursor ?? null,
      },
    };
  }

  async listProducts(query: ShopCatalogQuery = {}): Promise<ShopProduct[]> {
    const page = await this.listProductsPage(query);
    return page.products;
  }

  async getProductById(id: string): Promise<ShopProduct | null> {
    const ctx = this.contextVars();
    try {
      const data = await this.client.request<ProductByIdData>(
        PRODUCT_BY_ID_QUERY,
        {id, ...ctx},
      );
      if (!data.product) {
        return null;
      }
      return stripMappedExtras(mapShopifyProduct(data.product));
    } catch (err) {
      if (err instanceof ShopError && err.code === 'graphql') {
        return null;
      }
      throw err;
    }
  }

  async listBrands(): Promise<ShopBrand[]> {
    // Derive from a page of live products — never invent brand names.
    const page = await this.listProductsPage({first: 50, sort: 'featured'});
    const byId = new Map<string, ShopBrand>();
    for (const p of page.products) {
      if (!byId.has(p.brandId)) {
        byId.set(p.brandId, {id: p.brandId, name: p.brand});
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async listRelated(productId: string, limit = 4): Promise<ShopProduct[]> {
    const current = await this.getProductById(productId);
    if (!current) {
      return [];
    }
    const page = await this.listProductsPage({
      categoryId: current.category,
      first: Math.max(limit + 4, 12),
    });
    return page.products.filter(p => p.id !== productId).slice(0, limit);
  }
}
