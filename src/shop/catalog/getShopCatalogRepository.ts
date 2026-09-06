import type {ShopCatalogRepository} from './ShopCatalogRepository';
import {LocalShopCatalogRepository} from './LocalShopCatalogRepository';
import {MisconfiguredShopCatalogRepository} from './MisconfiguredShopCatalogRepository';
import {
  getShopifyStorefrontConfig,
  resolveShopCatalogSource,
} from '@/config/shopifyConfig';
import {ShopifyShopCatalogRepository} from '@/shop/shopify/ShopifyShopCatalogRepository';

let singleton: ShopCatalogRepository | null = null;

/**
 * Builds the catalogue repository for the current environment.
 *
 * Rules:
 * - Production/live → Shopify only (never silent mock fallback).
 * - Tests → local mock by default.
 * - Development → local only when SHOP_CATALOG_SOURCE=local; otherwise Shopify.
 * - Missing Shopify config in shopify mode → MisconfiguredShopCatalogRepository (error UI).
 */
export function createShopCatalogRepository(): ShopCatalogRepository {
  const source = resolveShopCatalogSource();
  if (source === 'local') {
    return new LocalShopCatalogRepository();
  }

  const cfg = getShopifyStorefrontConfig();
  if (!cfg.ok) {
    return new MisconfiguredShopCatalogRepository(cfg.reason);
  }
  return new ShopifyShopCatalogRepository(cfg.config);
}

/** Lazy singleton — do not call during app bootstrap / module evaluation of MainNavigator. */
export function getShopCatalogRepository(): ShopCatalogRepository {
  if (!singleton) {
    singleton = createShopCatalogRepository();
  }
  return singleton;
}

/** Test-only: swap or clear the repository singleton. */
export function setShopCatalogRepositoryForTests(
  repo: ShopCatalogRepository | null,
): void {
  singleton = repo;
}
