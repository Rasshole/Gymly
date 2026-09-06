/**
 * Minimal Shopify Storefront GraphQL client (fetch wrapper — no heavy GraphQL SDK).
 * Never logs authentication headers or tokens.
 */
import type {ShopifyStorefrontConfig} from '@/config/shopifyConfig';
import {ShopError} from './shopErrors';

export type StorefrontLanguageCode = 'EN' | 'DA' | 'NO' | 'SV';
export type StorefrontCountryCode = 'DK' | 'SE' | 'NO' | 'GB' | 'US';

export type StorefrontRequestContext = {
  country?: StorefrontCountryCode;
  language?: StorefrontLanguageCode;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type GraphQlError = {message?: string; extensions?: {code?: string}};

type GraphQlResponse<T> = {
  data?: T;
  errors?: GraphQlError[];
};

const DEFAULT_TIMEOUT_MS = 20_000;

export class ShopifyStorefrontClient {
  constructor(private readonly config: ShopifyStorefrontConfig) {}

  get storeDomain(): string {
    return this.config.storeDomain;
  }

  async request<T>(
    query: string,
    variables?: Record<string, unknown>,
    context: StorefrontRequestContext = {},
  ): Promise<T> {
    const timeoutMs = context.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    context.signal?.addEventListener('abort', onAbort);

    try {
      const response = await fetch(this.config.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Shopify-Storefront-Access-Token':
            this.config.storefrontPublicToken,
        },
        body: JSON.stringify({query, variables: variables ?? {}}),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ShopError(
          'network',
          'shop.errors.network',
          `HTTP ${response.status}`,
        );
      }

      let json: GraphQlResponse<T>;
      try {
        json = (await response.json()) as GraphQlResponse<T>;
      } catch {
        throw new ShopError(
          'invalid_response',
          'shop.errors.invalidResponse',
          'Invalid JSON',
        );
      }

      if (json.errors?.length) {
        const first = json.errors[0]?.message ?? 'GraphQL error';
        throw new ShopError('graphql', 'shop.errors.shopify', first);
      }

      if (json.data == null) {
        throw new ShopError(
          'invalid_response',
          'shop.errors.invalidResponse',
          'Empty data',
        );
      }

      return json.data;
    } catch (err) {
      if (err instanceof ShopError) {
        throw err;
      }
      if (
        (err instanceof Error && err.name === 'AbortError') ||
        controller.signal.aborted
      ) {
        throw new ShopError('cancelled', 'shop.errors.network', 'Aborted');
      }
      throw new ShopError(
        'network',
        'shop.errors.network',
        err instanceof Error ? err.message : 'Network failure',
      );
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener('abort', onAbort);
    }
  }
}

export function mapAppLanguageToStorefront(
  languageCode: string | undefined,
): StorefrontLanguageCode {
  switch ((languageCode ?? 'en').toLowerCase().slice(0, 2)) {
    case 'da':
      return 'DA';
    case 'nb':
    case 'no':
      return 'NO';
    case 'sv':
      return 'SV';
    default:
      return 'EN';
  }
}
