import type {
  ShopProduct,
  ShopCatalogQuery,
  ShopBrand,
  ShopCatalogPage,
} from '@/types/shop.types';

/**
 * Catalogue access boundary — Phase 1B: Shopify Storefront or explicit local (dev/test).
 */
export interface ShopCatalogRepository {
  listProducts(query?: ShopCatalogQuery): Promise<ShopProduct[]>;
  listProductsPage(query?: ShopCatalogQuery): Promise<ShopCatalogPage>;
  getProductById(id: string): Promise<ShopProduct | null>;
  listBrands(): Promise<ShopBrand[]>;
  listRelated(productId: string, limit?: number): Promise<ShopProduct[]>;
}
