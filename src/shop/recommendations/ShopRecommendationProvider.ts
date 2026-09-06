import type {ShopProduct} from '@/types/shop.types';

export type ShopRecommendationContext = {
  userId?: string | null;
  /** Reserved for workout-based personalization in a later phase. */
  hasTrainingSignal?: boolean;
};

/**
 * Recommendation boundary — Phase 1A fallback is curated/popular only.
 * Do not claim mock results are personally tailored in user-facing copy.
 */
export interface ShopRecommendationProvider {
  getRecommended(
    products: readonly ShopProduct[],
    context?: ShopRecommendationContext,
  ): Promise<ShopProduct[]>;
}

/**
 * Fallback: popular + featured curated list when training signal is absent.
 * DEV: this is intentionally not personalized.
 */
export class FallbackShopRecommendationProvider implements ShopRecommendationProvider {
  async getRecommended(
    products: readonly ShopProduct[],
    _context?: ShopRecommendationContext,
  ): Promise<ShopProduct[]> {
    const available = products.filter(p => p.available);
    const curated = available
      .filter(p => p.popular || p.featured)
      .sort((a, b) => {
        const score = (p: ShopProduct) => (p.featured ? 2 : 0) + (p.popular ? 1 : 0);
        return score(b) - score(a) || a.title.localeCompare(b.title);
      });
    if (curated.length >= 4) {
      return curated.slice(0, 8);
    }
    return available.slice(0, 8);
  }
}

let provider: ShopRecommendationProvider | null = null;

export function getShopRecommendationProvider(): ShopRecommendationProvider {
  if (!provider) {
    provider = new FallbackShopRecommendationProvider();
  }
  return provider;
}

export function setShopRecommendationProviderForTests(
  next: ShopRecommendationProvider | null,
): void {
  provider = next;
}
