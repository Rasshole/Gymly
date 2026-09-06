# Gymly web shop — partner outbound purchase

## Architecture discovered

| Surface | Location | Role |
|---------|----------|------|
| Mobile Shop | `src/shop/**` + Storefront API | Headless catalogue + Gymly/affiliate purchase |
| Marketing site | `website/` | `gymlyapp.com` landing / legal / auth confirm |
| Auth/deep-link web | `web/` | Confirm / reset-password / AASA |
| **Web shop** | Shopify Online Store at **`shop.gymlyapp.com`** | Customer-facing storefront |

There is **no Hydrogen app** and **no live theme Liquid source** in this monorepo.
The web-shop implementation added here is a **theme overlay** under `shopify-theme/`
plus shared TypeScript in `src/shop/web/` that reuses the app metafield contract.

## Metafield contract (shared with the app)

Namespace: `custom` (expose to Storefront API / Online Store as needed).

| Key | Type | Values / notes |
|-----|------|----------------|
| `gymly_destination_type` | Single line text | `gymly` (alias: `gymly_checkout`) or `affiliate`. **Absent → `gymly`.** |
| `gymly_affiliate_url` | URL / single line text | Exact partner-approved **HTTPS tracked** product URL |
| `gymly_affiliate_tracked` | Boolean / text | `true` asserts uncommon tracked formats |
| `gymly_price_verified_at` | Single line text / date | Optional ISO timestamp (display only) |
| `gymly_featured` / `gymly_category` / `gymly_sort_priority` | existing | Unchanged |

Partner brand display name = Shopify **Vendor**.

Affiliate tracking status (same as app):

| Status | Meaning | Web CTA |
|--------|---------|---------|
| `configured` | Valid HTTPS + tracking evidence or `gymly_affiliate_tracked` | **Buy at [Brand]** enabled |
| `untracked` | Valid HTTPS, no tracking evidence | Disabled — never Gymly checkout |
| `unavailable` | Missing / invalid / non-HTTPS / blocked scheme | Disabled |

Blocked schemes include `javascript:`, `data:`, `file:`, `intent:`, and app deep-link schemes.

## Manual Shopify Admin steps (Patrick)

### 1. Ensure metafield definitions exist

Settings → Custom data → Products → add (if missing):

1. `gymly_destination_type` — Single line text  
2. `gymly_affiliate_url` — URL (or single line text)  
3. `gymly_affiliate_tracked` — True or false (optional)  
4. `gymly_price_verified_at` — Single line text (optional)

Expose Storefront / storefront-relevant access as for Phase 1B.

### 2. Gymly-owned product (unchanged checkout)

1. Create/edit product with price, media, inventory.  
2. Vendor can be `Gymly`.  
3. `gymly_destination_type` = `gymly` **or leave blank**.  
4. Leave affiliate URL empty.  
5. Publish to Online Store.  
6. Verify **Add to cart / Buy now** still uses Gymly Shopify checkout.

### 3. Partner / affiliate product (example — non-production)

1. Create catalogue product (title, images, display price).  
2. **Vendor** = `Example Brand` (shown in “Buy at …”).  
3. `gymly_destination_type` = `affiliate`.  
4. `gymly_affiliate_url` = exact tracked HTTPS URL, e.g.  
   `https://example-brand.test/products/demo?aff_id=GYMLY-DEMO&utm_source=gymly`  
   (use your real partner tracking link in production — never commit secrets).  
5. Optional: `gymly_affiliate_tracked` = `true` if the network uses uncommon params.  
6. Optional: `gymly_price_verified_at` = `2026-09-05`.  
7. Prefer zero inventory / unavailable variants so a mis-set destination type cannot sell via Gymly.  
8. Publish (or keep Draft + password gate for QA).

### 4. Verify the tracked link

1. Open the product on `shop.gymlyapp.com` (password OK for QA).  
2. Confirm price disclaimer + “Sold and fulfilled by Example Brand.”  
3. Confirm CTA **Buy at Example Brand**.  
4. Click CTA → new tab → URL host + **all query params identical** to the metafield.  
5. Confirm Gymly cart/checkout controls are absent.  
6. In DevTools, confirm a `affiliate_outbound_click` / `dataLayer` push with hostname only (no full URL).

### 5. Disable a partner product safely

- Set `gymly_destination_type` = `affiliate` and clear `gymly_affiliate_url`, **or**  
- Set product status to **Draft** / unpublish Online Store, **or**  
- Leave URL but remove tracking (becomes `untracked` → CTA disabled).  

Never flip an affiliate product to `gymly` unless Gymly truly sells and fulfils it.

### 6. Distinguish Gymly vs affiliate

| | Gymly-owned | Affiliate |
|--|-------------|-----------|
| `gymly_destination_type` | `gymly` / blank | `affiliate` |
| CTA | Add to cart / checkout | Buy at [Vendor] |
| Seller copy | Gymly Shop | Sold and fulfilled by [Vendor] |
| Cart | Yes | Never |

### 7. Test without a real purchase

- Use a non-production example URL or a partner sandbox link.  
- Click outbound CTA only — do not complete payment on the partner site.  
- Keep Online Store password enabled until public launch.  
- Do not treat `affiliate_outbound_click` as an order or commission.

## Theme install

See [`shopify-theme/README.md`](../shopify-theme/README.md). Merge locale patches;
do not overwrite entire theme locale files.

## Analytics

Event: `affiliate_outbound_click`  
Fields: product id, variant id (when known), handle, partner brand, destination **hostname**,
`sales_source: gymly_web_shop`, timestamp.  
Not a purchase. Affiliate network remains source of truth for conversion/commission.
