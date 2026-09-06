/**
 * Typed Shopify Storefront / Shop catalogue errors — never include tokens or raw GraphQL dumps in UI.
 */

export type ShopErrorCode =
  | 'missing_config'
  | 'network'
  | 'graphql'
  | 'invalid_response'
  | 'product_not_found'
  | 'checkout'
  | 'cart'
  | 'cancelled';

export class ShopError extends Error {
  readonly code: ShopErrorCode;
  readonly userMessageKey: string;
  readonly details?: string;

  constructor(
    code: ShopErrorCode,
    userMessageKey: string,
    message?: string,
    details?: string,
  ) {
    super(message ?? code);
    this.name = 'ShopError';
    this.code = code;
    this.userMessageKey = userMessageKey;
    this.details = details;
  }
}

export function isShopError(value: unknown): value is ShopError {
  return value instanceof ShopError;
}
