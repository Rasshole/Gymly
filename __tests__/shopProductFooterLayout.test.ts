/**
 * Shop product sticky footer spacing — with/without bottom safe-area inset.
 */
import {spacing, layout} from '@/theme/designTokens';
import {
  SHOP_PRODUCT_FOOTER_BODY_HEIGHT,
  shopProductFooterPaddingBottom,
  shopProductScrollPaddingBottom,
} from '@/shop/utils/shopProductFooterLayout';

describe('shopProductFooterLayout', () => {
  it('uses only the safe-area inset under Buy now on notched iPhones', () => {
    expect(shopProductFooterPaddingBottom(34)).toBe(34);
    expect(shopProductFooterPaddingBottom(34)).toBeLessThan(
      spacing.xxxl + 88 + 34,
    );
  });

  it('uses a small floor when safe-area bottom is 0 (home-button devices)', () => {
    expect(shopProductFooterPaddingBottom(0)).toBe(spacing.sm);
    expect(shopProductFooterPaddingBottom(-1)).toBe(spacing.sm);
  });

  it('does not stack xxxl + fixed 88 under the button', () => {
    const beforeStyleGuess = spacing.xxxl + 88 + Math.max(34, spacing.md);
    const after = shopProductFooterPaddingBottom(34);
    expect(after).toBe(34);
    expect(after).toBeLessThan(beforeStyleGuess);
  });

  it('scroll padding clears the sticky footer without double-safe-area bloat', () => {
    const scrollPad = shopProductScrollPaddingBottom(34);
    expect(scrollPad).toBe(SHOP_PRODUCT_FOOTER_BODY_HEIGHT + 34);
    expect(scrollPad).toBeGreaterThan(layout.buttonMinHeight + 34);
    // Former scroll pad was xxxl + 88 + inset — keep scroll pad in a similar band
    // but without requiring that oversized constant under the button itself.
    expect(shopProductFooterPaddingBottom(34)).toBe(34);
  });
});
