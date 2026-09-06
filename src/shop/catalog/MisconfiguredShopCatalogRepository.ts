import type {
  ShopBrand,
  ShopCatalogPage,
  ShopCatalogQuery,
  ShopProduct,
} from '@/types/shop.types';
import type {ShopCatalogRepository} from './ShopCatalogRepository';
import {ShopError} from '@/shop/shopify/shopErrors';

/**
 * Used when production/live mode lacks Shopify configuration.
 * Never returns mock products.
 */
export class MisconfiguredShopCatalogRepository
  implements ShopCatalogRepository
{
  constructor(private readonly reason = 'missing_config') {}

  private fail(): never {
    throw new ShopError(
      'missing_config',
      'shop.errors.missingConfig',
      this.reason,
    );
  }

  async listProducts(_query?: ShopCatalogQuery): Promise<ShopProduct[]> {
    return Promise.reject(
      new ShopError(
        'missing_config',
        'shop.errors.missingConfig',
        this.reason,
      ),
    );
  }

  async listProductsPage(_query?: ShopCatalogQuery): Promise<ShopCatalogPage> {
    return Promise.reject(
      new ShopError(
        'missing_config',
        'shop.errors.missingConfig',
        this.reason,
      ),
    );
  }

  async getProductById(_id: string): Promise<ShopProduct | null> {
    return Promise.reject(
      new ShopError(
        'missing_config',
        'shop.errors.missingConfig',
        this.reason,
      ),
    );
  }

  async listBrands(): Promise<ShopBrand[]> {
    return Promise.reject(
      new ShopError(
        'missing_config',
        'shop.errors.missingConfig',
        this.reason,
      ),
    );
  }

  async listRelated(_productId: string, _limit?: number): Promise<ShopProduct[]> {
    return Promise.reject(
      new ShopError(
        'missing_config',
        'shop.errors.missingConfig',
        this.reason,
      ),
    );
  }
}
