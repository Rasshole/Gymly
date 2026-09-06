/**
 * Web-shop customer strings (Shopify Online Store locales).
 * Kept in sync with shopify-theme/locales/*.json — 100% key coverage across locales.
 */
export type WebShopLocaleCode = 'en' | 'da' | 'nb' | 'sv';

export type WebShopAffiliateCopy = {
  buy_at_brand: string;
  sold_and_fulfilled_by_brand: string;
  final_price_confirmed_at_brand: string;
  product_unavailable: string;
  buy_at_brand_a11y: string;
};

export const WEB_SHOP_AFFILIATE_COPY: Record<
  WebShopLocaleCode,
  WebShopAffiliateCopy
> = {
  en: {
    buy_at_brand: 'Buy at {{brand}}',
    sold_and_fulfilled_by_brand: 'Sold and fulfilled by {{brand}}.',
    final_price_confirmed_at_brand: 'Final price confirmed at {{brand}}.',
    product_unavailable: 'This product is currently unavailable.',
    buy_at_brand_a11y:
      'Buy at {{brand}}. Opens the brand website in a new browser tab.',
  },
  da: {
    buy_at_brand: 'Køb hos {{brand}}',
    sold_and_fulfilled_by_brand: 'Solgt og opfyldt af {{brand}}.',
    final_price_confirmed_at_brand: 'Endelig pris bekræftes hos {{brand}}.',
    product_unavailable: 'Dette produkt er ikke tilgængeligt lige nu.',
    buy_at_brand_a11y:
      'Køb hos {{brand}}. Åbner brandets website i en ny fane.',
  },
  nb: {
    buy_at_brand: 'Kjøp hos {{brand}}',
    sold_and_fulfilled_by_brand: 'Solgt og levert av {{brand}}.',
    final_price_confirmed_at_brand: 'Endelig pris bekreftes hos {{brand}}.',
    product_unavailable: 'Dette produktet er ikke tilgjengelig akkurat nå.',
    buy_at_brand_a11y:
      'Kjøp hos {{brand}}. Åpner merkevarens nettsted i en ny fane.',
  },
  sv: {
    buy_at_brand: 'Köp hos {{brand}}',
    sold_and_fulfilled_by_brand: 'Såld och levererad av {{brand}}.',
    final_price_confirmed_at_brand: 'Slutpris bekräftas hos {{brand}}.',
    product_unavailable: 'Denna produkt är inte tillgänglig just nu.',
    buy_at_brand_a11y:
      'Köp hos {{brand}}. Öppnar varumärkets webbplats i en ny flik.',
  },
};

export const WEB_SHOP_LOCALE_CODES: readonly WebShopLocaleCode[] = [
  'en',
  'da',
  'nb',
  'sv',
];

export function webShopAffiliateCopyKeys(): (keyof WebShopAffiliateCopy)[] {
  return [
    'buy_at_brand',
    'sold_and_fulfilled_by_brand',
    'final_price_confirmed_at_brand',
    'product_unavailable',
    'buy_at_brand_a11y',
  ];
}
