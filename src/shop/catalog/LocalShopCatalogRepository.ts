import type {ShopBrand, ShopCatalogQuery, ShopCatalogPage, ShopProduct} from '@/types/shop.types';
import type {ShopCatalogRepository} from './ShopCatalogRepository';
import {MOCK_SHOP_BRANDS, MOCK_SHOP_PRODUCTS} from './mockShopProducts';
import {filterAndSortShopProducts} from '../utils/filterAndSortShopProducts';

/** Simulates a short network delay so loading UI is exercised locally. */
const LOCAL_LATENCY_MS = 40;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class LocalShopCatalogRepository implements ShopCatalogRepository {
  private readonly products: readonly ShopProduct[];
  private readonly brands: readonly ShopBrand[];

  constructor(
    products: readonly ShopProduct[] = MOCK_SHOP_PRODUCTS,
    brands: readonly ShopBrand[] = MOCK_SHOP_BRANDS,
  ) {
    this.products = products;
    this.brands = brands;
  }

  async listProducts(query: ShopCatalogQuery = {}): Promise<ShopProduct[]> {
    const page = await this.listProductsPage(query);
    return page.products;
  }

  async listProductsPage(query: ShopCatalogQuery = {}): Promise<ShopCatalogPage> {
    await delay(LOCAL_LATENCY_MS);
    const all = filterAndSortShopProducts(this.products, query);
    const first = query.first ?? all.length;
    const offset = query.after ? Number.parseInt(query.after, 10) || 0 : 0;
    const slice = all.slice(offset, offset + first);
    const nextOffset = offset + slice.length;
    return {
      products: slice,
      pageInfo: {
        hasNextPage: nextOffset < all.length,
        endCursor: nextOffset < all.length ? String(nextOffset) : null,
      },
    };
  }

  async getProductById(id: string): Promise<ShopProduct | null> {
    await delay(LOCAL_LATENCY_MS);
    return this.products.find(p => p.id === id) ?? null;
  }

  async listBrands(): Promise<ShopBrand[]> {
    await delay(LOCAL_LATENCY_MS);
    return [...this.brands];
  }

  async listRelated(productId: string, limit = 4): Promise<ShopProduct[]> {
    await delay(LOCAL_LATENCY_MS);
    const current = this.products.find(p => p.id === productId);
    if (!current) {
      return [];
    }
    const sameCategory = this.products.filter(
      p => p.id !== productId && p.category === current.category && p.available,
    );
    const sameBrand = this.products.filter(
      p =>
        p.id !== productId &&
        p.brandId === current.brandId &&
        p.category !== current.category &&
        p.available,
    );
    const merged = [...sameCategory, ...sameBrand];
    const seen = new Set<string>();
    const out: ShopProduct[] = [];
    for (const p of merged) {
      if (seen.has(p.id)) {
        continue;
      }
      seen.add(p.id);
      out.push(p);
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  }
}
