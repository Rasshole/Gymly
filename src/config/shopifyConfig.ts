/**
 * Shopify Storefront configuration — public token only, never Admin / private tokens.
 * Values come from react-native-config (.env). Never log token values.
 */
import Config from 'react-native-config';

export const SHOPIFY_DEFAULT_API_VERSION = '2026-04';
export const SHOPIFY_DEFAULT_STORE_DOMAIN = 'f08uqq-vy.myshopify.com';

export type ShopCatalogSource = 'shopify' | 'local';

export type ShopifyStorefrontConfig = {
  storeDomain: string;
  storefrontPublicToken: string;
  apiVersion: string;
  /** GraphQL endpoint — derived, never includes the token. */
  graphqlUrl: string;
};

export type ShopifyConfigResult =
  | {ok: true; config: ShopifyStorefrontConfig}
  | {ok: false; reason: 'missing_domain' | 'missing_token' | 'invalid_domain'};

function readEnv(key: string): string | undefined {
  const fromConfig = (Config as Record<string, string | undefined> | undefined)?.[key];
  if (typeof fromConfig === 'string' && fromConfig.trim()) {
    return fromConfig.trim();
  }
  if (typeof process !== 'undefined' && process.env?.[key]?.trim()) {
    return process.env[key]!.trim();
  }
  return undefined;
}

export function normalizeShopifyStoreDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!trimmed || trimmed.includes(' ') || trimmed.includes('/')) {
    return null;
  }
  return trimmed;
}

export function resolveShopCatalogSource(
  options: {isDev?: boolean; isTest?: boolean} = {},
): ShopCatalogSource {
  const isTest =
    options.isTest ??
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'test');
  const isDev =
    options.isDev ??
    (typeof __DEV__ !== 'undefined' ? __DEV__ : false);

  const raw = readEnv('SHOP_CATALOG_SOURCE')?.toLowerCase();
  if (raw === 'local') {
    // Production must never silently serve mocks.
    if (!isDev && !isTest) {
      return 'shopify';
    }
    return 'local';
  }
  if (raw === 'shopify') {
    return 'shopify';
  }
  if (isTest) {
    return 'local';
  }
  return 'shopify';
}

export function getShopifyStorefrontConfig(): ShopifyConfigResult {
  const domainRaw =
    readEnv('SHOPIFY_STORE_DOMAIN') ?? SHOPIFY_DEFAULT_STORE_DOMAIN;
  const domain = normalizeShopifyStoreDomain(domainRaw);
  if (!domain) {
    return {ok: false, reason: 'invalid_domain'};
  }
  const token = readEnv('SHOPIFY_STOREFRONT_PUBLIC_TOKEN');
  if (!token) {
    return {ok: false, reason: 'missing_token'};
  }
  const apiVersion =
    readEnv('SHOPIFY_STOREFRONT_API_VERSION') ?? SHOPIFY_DEFAULT_API_VERSION;
  return {
    ok: true,
    config: {
      storeDomain: domain,
      storefrontPublicToken: token,
      apiVersion,
      graphqlUrl: `https://${domain}/api/${apiVersion}/graphql.json`,
    },
  };
}

/** Hosts allowed for Shopify-hosted checkout URLs. */
export function isAllowedShopifyCheckoutHost(
  hostname: string,
  storeDomain: string,
): boolean {
  const host = hostname.toLowerCase();
  const store = storeDomain.toLowerCase();
  if (host === store) {
    return true;
  }
  if (host.endsWith('.myshopify.com')) {
    return true;
  }
  if (host === 'checkout.shopify.com' || host.endsWith('.shopify.com')) {
    return true;
  }
  if (host === 'shop.gymlyapp.com' || host.endsWith('.gymlyapp.com')) {
    return true;
  }
  return false;
}
