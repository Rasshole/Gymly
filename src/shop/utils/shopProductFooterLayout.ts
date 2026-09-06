/**
 * Shop product sticky CTA footer spacing — pure helpers for layout tests.
 * Bottom padding should be only the device home-indicator inset (plus a small
 * floor on devices with no inset). Avoid stacking tab-bar height or xxxl buffers
 * under the Buy now button.
 */
import {spacing, layout} from '@/theme/designTokens';

/** Approx. footer body above the safe-area inset (hint + gap + button + top pad). */
export const SHOP_PRODUCT_FOOTER_BODY_HEIGHT =
  spacing.md + // paddingTop
  40 + // cta hint (up to ~2 lines)
  spacing.sm + // gap
  layout.buttonMinHeight +
  spacing.sm; // small buffer above safe area

/**
 * Padding under the Buy now button — safe-area only.
 * Legacy home-button phones (inset 0) get a small floor so the CTA is not flush.
 */
export function shopProductFooterPaddingBottom(safeAreaBottom: number): number {
  const bottom = Number.isFinite(safeAreaBottom) ? Math.max(0, safeAreaBottom) : 0;
  return bottom > 0 ? bottom : spacing.sm;
}

/** Scroll content bottom inset so product content clears the sticky footer. */
export function shopProductScrollPaddingBottom(safeAreaBottom: number): number {
  return (
    SHOP_PRODUCT_FOOTER_BODY_HEIGHT +
    shopProductFooterPaddingBottom(safeAreaBottom)
  );
}
