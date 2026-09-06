# Gymly Shopify Online Store — affiliate overlay

`shop.gymlyapp.com` is the Shopify **Online Store** (custom domain on store
`f08uqq-vy.myshopify.com`). The live theme source is **not** checked into this
repository. This folder is a production-safe overlay you copy into the live theme.

## Files

| Path | Purpose |
|------|---------|
| `snippets/gymly-affiliate-product.liquid` | Product-page purchase gate |
| `assets/gymly-affiliate-outbound.js` | URL validation, CTA enablement, analytics |
| `assets/gymly-affiliate-outbound.css` | Responsive CTA / disclosure layout |
| `locales/gymly-affiliate.*.patch.json` | Merge these keys into theme locales |

Shared decisioning (Jest-tested) lives in `src/shop/web/`.

## Install (manual — do not publish from CI in this task)

1. Shopify Admin → Online Store → Themes → **Edit code** (or Shopify CLI `theme pull` then edit).
2. Upload assets + snippet from this folder.
3. **Merge** locale patch keys into `en.default.json`, `da.json`, `nb.json`, `sv.json`
   (do not replace entire locale files).
4. In the main product section (often `sections/main-product.liquid`), wrap buy buttons:

```liquid
{% capture gymly_buy_buttons %}
  {% render 'buy-buttons', product: product, block: block, product_form_id: product_form_id %}
{% endcapture %}
{% render 'gymly-affiliate-product', product: product, buy_buttons: gymly_buy_buttons %}
```

Adjust the inner `buy-buttons` render to match your theme’s existing call.

5. Save. Do **not** remove storefront password during controlled QA.
6. Verify with a Draft / password-gated product — see
   [`docs/shop-web-affiliate-outbound.md`](../docs/shop-web-affiliate-outbound.md).

## Safety

- Affiliate products never render Gymly cart / Shop Pay / checkout CTAs.
- Collection/search cards keep linking to the Gymly product detail page.
- Outbound opens `target="_blank"` with `rel="noopener noreferrer sponsored"`.
- Analytics event `affiliate_outbound_click` stores hostname only — never the full tracked URL.
