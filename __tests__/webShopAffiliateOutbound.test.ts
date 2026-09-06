/**
 * Web shop affiliate outbound — Gymly checkout vs partner Buy at [Brand].
 */
import {
  GYMLY_WEB_SALES_SOURCE,
  resolveWebShopPurchaseUi,
  buildAffiliateOutboundClickEvent,
  openAffiliateOutboundPurchase,
  formatWebShopBrandCopy,
} from '@/shop/web/affiliateOutboundWeb';
import {
  WEB_SHOP_AFFILIATE_COPY,
  WEB_SHOP_LOCALE_CODES,
  webShopAffiliateCopyKeys,
} from '@/shop/web/webShopLocales';
import {resolveSalesModel} from '@/shop/shopify/mapShopifyProduct';
import {validateProductDestinationUrl} from '@/shop/destination/validateProductDestinationUrl';
import fs from 'fs';
import path from 'path';

const TRACKED =
  'https://partner.example/products/creatine?aff_id=GYMLY-QA&utm_source=gymly&utm_campaign=shop';

const UNCOMMON_TRACKED =
  'https://shop.partner-brand.example/p/abc123;jsessionid=9?xclid=opaque-token-99';

function affiliateInput(
  overrides: Partial<{
    productId: string;
    handle: string;
    brand: string;
    destinationTypeRaw: string | null;
    affiliateUrlRaw: string | null;
    affiliateTrackedRaw: string | null;
    variantId: string | null;
  }> = {},
) {
  return {
    productId: 'gid://shopify/Product/1001',
    handle: 'partner-creatine',
    brand: 'Nordic Fuel',
    destinationTypeRaw: 'affiliate',
    affiliateUrlRaw: TRACKED,
    affiliateTrackedRaw: null,
    variantId: 'gid://shopify/ProductVariant/2002',
    ...overrides,
  };
}

describe('web shop sales model contract', () => {
  it('defaults existing Gymly products to gymly checkout', () => {
    expect(resolveSalesModel(undefined)).toBe('gymly');
    expect(resolveSalesModel(null)).toBe('gymly');
    expect(resolveSalesModel('')).toBe('gymly');
    expect(resolveSalesModel('gymly')).toBe('gymly');
    expect(resolveSalesModel('gymly_checkout')).toBe('gymly');
  });

  it('maps affiliate destination type', () => {
    expect(resolveSalesModel('affiliate')).toBe('affiliate');
    expect(resolveSalesModel('AFFILIATE')).toBe('affiliate');
  });
});

describe('web shop Gymly-owned products', () => {
  it('keeps Gymly cart/checkout and does not expose outbound CTA', () => {
    const ui = resolveWebShopPurchaseUi(
      affiliateInput({
        destinationTypeRaw: 'gymly',
        affiliateUrlRaw: TRACKED,
      }),
    );
    expect(ui.salesModel).toBe('gymly');
    expect(ui.allowGymlyCart).toBe(true);
    expect(ui.allowOutbound).toBe(false);
    expect(ui.ctaEnabled).toBe(false);
    expect(ui.destinationUrl).toBeNull();
  });

  it('does not open affiliate navigation for Gymly products', () => {
    const opened: string[] = [];
    const result = openAffiliateOutboundPurchase({
      input: affiliateInput({destinationTypeRaw: null, affiliateUrlRaw: TRACKED}),
      openUrl: url => opened.push(url),
    });
    expect(result.ok).toBe(false);
    expect(opened).toHaveLength(0);
  });
});

describe('web shop configured affiliate products', () => {
  it('enables Buy at [Brand] outbound and blocks Gymly cart', () => {
    const ui = resolveWebShopPurchaseUi(affiliateInput());
    expect(ui.salesModel).toBe('affiliate');
    expect(ui.allowGymlyCart).toBe(false);
    expect(ui.allowOutbound).toBe(true);
    expect(ui.ctaEnabled).toBe(true);
    expect(ui.destinationUrl).toBe(TRACKED);
    expect(ui.destinationHostname).toBe('partner.example');
  });

  it('preserves affiliate query parameters exactly', () => {
    const ui = resolveWebShopPurchaseUi(affiliateInput());
    expect(ui.salesModel).toBe('affiliate');
    if (ui.salesModel !== 'affiliate' || !ui.destinationUrl) {
      throw new Error('expected configured affiliate');
    }
    const parsed = new URL(ui.destinationUrl);
    expect(parsed.searchParams.get('aff_id')).toBe('GYMLY-QA');
    expect(parsed.searchParams.get('utm_source')).toBe('gymly');
    expect(parsed.searchParams.get('utm_campaign')).toBe('shop');
    expect(ui.destinationUrl).toContain('aff_id=GYMLY-QA');
  });

  it('formats partner price disclaimer and fulfilment disclosure', () => {
    const brand = 'Nordic Fuel';
    expect(
      formatWebShopBrandCopy(
        WEB_SHOP_AFFILIATE_COPY.en.buy_at_brand,
        brand,
      ),
    ).toBe('Buy at Nordic Fuel');
    expect(
      formatWebShopBrandCopy(
        WEB_SHOP_AFFILIATE_COPY.en.sold_and_fulfilled_by_brand,
        brand,
      ),
    ).toBe('Sold and fulfilled by Nordic Fuel.');
    expect(
      formatWebShopBrandCopy(
        WEB_SHOP_AFFILIATE_COPY.en.final_price_confirmed_at_brand,
        brand,
      ),
    ).toBe('Final price confirmed at Nordic Fuel.');
  });

  it('opens partner link via new-tab opener with exact URL', () => {
    const opened: string[] = [];
    const result = openAffiliateOutboundPurchase({
      input: affiliateInput(),
      openUrl: url => opened.push(url),
    });
    expect(result.ok).toBe(true);
    expect(opened).toEqual([TRACKED]);
    if (result.ok) {
      expect(result.url).toBe(TRACKED);
    }
  });

  it('accepts valid uncommon HTTPS affiliate URL when partner-marked tracked', () => {
    const ui = resolveWebShopPurchaseUi(
      affiliateInput({
        affiliateUrlRaw: UNCOMMON_TRACKED,
        affiliateTrackedRaw: 'true',
      }),
    );
    expect(ui.ctaEnabled).toBe(true);
    expect(ui.destinationUrl).toBe(UNCOMMON_TRACKED);
  });
});

describe('web shop invalid affiliate states', () => {
  it('disables CTA when link is missing', () => {
    const ui = resolveWebShopPurchaseUi(
      affiliateInput({affiliateUrlRaw: ''}),
    );
    expect(ui.allowGymlyCart).toBe(false);
    expect(ui.ctaEnabled).toBe(false);
    expect(ui.salesModel).toBe('affiliate');
    if (ui.salesModel === 'affiliate') {
      expect(ui.unavailableReason).toBe('missing_url');
    }
  });

  it('disables CTA when untracked', () => {
    const ui = resolveWebShopPurchaseUi(
      affiliateInput({
        affiliateUrlRaw: 'https://partner.example/products/plain',
      }),
    );
    expect(ui.ctaEnabled).toBe(false);
    expect(ui.affiliateTrackingStatus).toBe('untracked');
    expect(ui.allowGymlyCart).toBe(false);
  });

  it('disables CTA when unavailable / malformed', () => {
    const ui = resolveWebShopPurchaseUi(
      affiliateInput({affiliateUrlRaw: 'not a url'}),
    );
    expect(ui.ctaEnabled).toBe(false);
    expect(ui.affiliateTrackingStatus).toBe('unavailable');
  });

  it('rejects unsafe and non-HTTPS URLs', () => {
    const javascriptUrl = ['javascript', ':alert(1)'].join('');
    const intentUrl = ['intent', '://scan/#Intent;end'].join('');
    expect(validateProductDestinationUrl('http://partner.example/x').ok).toBe(
      false,
    );
    expect(validateProductDestinationUrl(javascriptUrl).ok).toBe(false);
    expect(validateProductDestinationUrl('data:text/html,hi').ok).toBe(false);
    expect(validateProductDestinationUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateProductDestinationUrl(intentUrl).ok).toBe(false);

    for (const raw of [
      'http://partner.example/x?aff_id=1',
      javascriptUrl,
      intentUrl,
    ]) {
      const ui = resolveWebShopPurchaseUi(affiliateInput({affiliateUrlRaw: raw}));
      expect(ui.ctaEnabled).toBe(false);
      expect(ui.allowGymlyCart).toBe(false);
    }
  });

  it('never silently falls back to Gymly checkout for broken affiliate', () => {
    const ui = resolveWebShopPurchaseUi(
      affiliateInput({affiliateUrlRaw: 'https://partner.example/plain'}),
    );
    expect(ui.salesModel).toBe('affiliate');
    expect(ui.allowGymlyCart).toBe(false);
    expect(ui.ctaEnabled).toBe(false);
  });
});

describe('web shop affiliate analytics', () => {
  it('fires outbound-click once and is not a purchase event', () => {
    const events: unknown[] = [];
    const result = openAffiliateOutboundPurchase({
      input: affiliateInput(),
      record: payload => events.push(payload),
      openUrl: () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(events).toHaveLength(1);
    const payload = events[0] as ReturnType<typeof buildAffiliateOutboundClickEvent>;
    expect(payload.event).toBe('affiliate_outbound_click');
    expect(payload.sales_source).toBe(GYMLY_WEB_SALES_SOURCE);
    expect(payload.partner_brand).toBe('Nordic Fuel');
    expect(payload.product_handle).toBe('partner-creatine');
    expect(payload.destination_hostname).toBe('partner.example');
    expect(payload.shopify_variant_id).toBe('gid://shopify/ProductVariant/2002');
    expect(JSON.stringify(payload)).not.toContain('aff_id');
    expect(JSON.stringify(payload)).not.toContain('utm_source');
    expect(payload.event).not.toBe('purchase');
    expect(payload.event).not.toMatch(/order|commission/i);
  });
});

describe('web shop locale coverage', () => {
  it('includes required strings for every supported locale', () => {
    const keys = webShopAffiliateCopyKeys();
    expect(WEB_SHOP_LOCALE_CODES).toEqual(['en', 'da', 'nb', 'sv']);
    for (const locale of WEB_SHOP_LOCALE_CODES) {
      const copy = WEB_SHOP_AFFILIATE_COPY[locale];
      for (const key of keys) {
        expect(typeof copy[key]).toBe('string');
        expect(copy[key].length).toBeGreaterThan(0);
      }
      expect(copy.buy_at_brand).toContain('{{brand}}');
      expect(copy.sold_and_fulfilled_by_brand).toContain('{{brand}}');
      expect(copy.final_price_confirmed_at_brand).toContain('{{brand}}');
    }
  });

  it('theme locale patches stay in sync with TS copy keys', () => {
    const localesDir = path.join(
      __dirname,
      '..',
      'shopify-theme',
      'locales',
    );
    const files = [
      'gymly-affiliate.en.default.patch.json',
      'gymly-affiliate.da.patch.json',
      'gymly-affiliate.nb.patch.json',
      'gymly-affiliate.sv.patch.json',
    ];
    for (const file of files) {
      const json = JSON.parse(
        fs.readFileSync(path.join(localesDir, file), 'utf8'),
      ) as {gymly: {affiliate: Record<string, string>}};
      for (const key of webShopAffiliateCopyKeys()) {
        expect(json.gymly.affiliate[key]).toBeTruthy();
      }
    }
  });
});

describe('web shop theme overlay presence', () => {
  it('ships snippet + assets without a full theme checkout rewrite', () => {
    const root = path.join(__dirname, '..', 'shopify-theme');
    expect(
      fs.existsSync(path.join(root, 'snippets', 'gymly-affiliate-product.liquid')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, 'assets', 'gymly-affiliate-outbound.js')),
    ).toBe(true);
    const js = fs.readFileSync(
      path.join(root, 'assets', 'gymly-affiliate-outbound.js'),
      'utf8',
    );
    expect(js).toContain('affiliate_outbound_click');
    expect(js).toContain('noopener noreferrer sponsored');
    expect(js).toContain('gymly_web_shop');
    expect(js).toContain('hideGymlyCart');
  });
});
