# Gymly Shop — Shopify Admin workflow (Phase 1B)

## Store

- Domain: `f08uqq-vy.myshopify.com`
- Storefront API version: `2026-04`
- App uses the **public Storefront access token only** (never Admin / private tokens).

## Metafields (required for hybrid commerce)

Create product metafields under namespace `custom` and **expose them to the Storefront API**
(Settings → Custom data → Products → Storefront access, or Admin GraphQL
`metafieldStorefrontVisibilityCreate`):

| Key | Type | Values |
|-----|------|--------|
| `gymly_destination_type` | Single line text | `gymly` \| `affiliate` (alias: `gymly_checkout` → gymly) |
| `gymly_affiliate_url` | URL / single line text | Exact partner-approved HTTPS **tracked** affiliate URL |
| `gymly_affiliate_tracked` (optional) | Boolean / text | `true` asserts the URL is the approved tracked link |
| `gymly_price_verified_at` (optional) | Single line text / date | ISO timestamp when partner display price was verified |
| `gymly_featured` (optional) | Boolean / text | `true` to feature on Shop home |
| `gymly_category` (optional) | Single line text | `activewear` \| `equipment` \| `supplements` \| `recovery` \| `accessories` |
| `gymly_sort_priority` (optional) | Integer | Lower = earlier among featured |

If `gymly_destination_type` is absent on a normal Shopify product → app defaults to **gymly** checkout.

**Web storefront (`shop.gymlyapp.com`):** live theme source is not in this repo. Install the
overlay in `shopify-theme/` and follow [`shop-web-affiliate-outbound.md`](./shop-web-affiliate-outbound.md).

## Collections

Create Smart/Manual collections with these handles (changeable in
`src/shop/shopify/shopifyCollectionHandles.ts`):

- `activewear`
- `equipment`
- `supplements`
- `recovery`
- `accessories`
- `featured` (optional; used when no metafield-featured products exist)

Missing collections show an empty category — they never pull unrelated products.

## Featured products rule

1. Products with `custom.gymly_featured` truthy  
2. Else products in collection handle `featured`  
3. Else a deterministic slice of live catalogue products  

## Standard Gymly product

1. Create product in Shopify Admin.  
2. Title, description, real images.  
3. Set **Vendor** (maps to brand in-app).  
4. Set product type / tags; assign Gymly collection.  
5. Price + compare-at; variants + inventory + shipping.  
6. Metafield `gymly_destination_type` = `gymly`.  
7. Publish to **Online Store** and **Headless** (Storefront).  
8. Status **Active**.  
9. Verify on `shop.gymlyapp.com` and in the app.  
10. Tap **Buy now** → Shopify checkout opens in-app (SFSafariView / Custom Tabs).

## Affiliate product

1. Create catalogue product with approved content/images.  
2. Vendor + type + collection.  
3. Display price only when partner-approved.  
4. Metafield `gymly_destination_type` = `affiliate`.  
5. Metafield `gymly_affiliate_url` = **exact** partner-approved HTTPS **tracked** URL  
   (preserve all tracking query parameters — never paste a plain product page).  
6. Optional: `gymly_affiliate_tracked` = `true` when the merchant asserts the URL is the
   approved tracked link (useful if the network uses uncommon param names).  
7. Prefer marking variants unavailable / zero inventory so the product is not
   unintentionally purchased via Gymly checkout if destination is mis-set.  
8. Publish to Headless.  
9. App CTA: **View at [Vendor]** — opens only when tracking status is `configured`.

### Affiliate tracking status (app)

| Status | Meaning | Public CTA |
|--------|---------|------------|
| `configured` | Valid HTTPS URL with tracking evidence (or `gymly_affiliate_tracked`) | Enabled |
| `untracked` | Valid HTTPS URL but **no** tracking evidence (plain product URL) | **Disabled** — not commission-enabled |
| `unavailable` | Missing / invalid / insecure URL | **Disabled** |

The app never invents tracking parameters or commission rates, never displays rates to
customers, and never claims affiliate attribution without a configured tracked link.

## Gymly checkout attribution

`cartCreate` includes non-sensitive cart + line attributes:

- `gymly_sales_source` (`gymly_app_ios` / `gymly_app_android`)
- `gymly_product_id` (Shopify product GID)
- `gymly_variant_id` (Shopify variant GID)
- `gymly_vendor` (Shopify vendor string)
- `gymly_product_handle` (optional)

Shopify already retains vendor and merchandise IDs on the order. These attributes mark
the Gymly app as the sales source for later reconciliation.

**Out of scope for Phase 1B:** automatic partner payouts, returns settlement, and
commission ledger. Those require a later **vendor-ledger / payout** phase.

## App environment

See root `.env.example`. Copy to `.env` (gitignored):

```env
SHOPIFY_STORE_DOMAIN=f08uqq-vy.myshopify.com
SHOPIFY_STOREFRONT_PUBLIC_TOKEN=YOUR_PUBLIC_TOKEN
SHOPIFY_STOREFRONT_API_VERSION=2026-04
SHOP_CATALOG_SOURCE=shopify
```

### iOS

1. Ensure CocoaPods includes `react-native-config` (already in Podfile.lock).  
2. Place `.env` at repo root.  
3. Rebuild the native app (`npx pod-install` if needed, then Xcode/CLI build).  
4. Metro alone is not enough after changing `.env` — rebuild native.

### Android

1. `android/app/build.gradle` applies `react-native-config` `dotenv.gradle`.  
2. Place `.env` at repo root.  
3. Rebuild the Android app.

### Release safety

- Production builds must use `SHOP_CATALOG_SOURCE=shopify` with a real public token.  
- Missing token → Shop shows a configuration error (never mock products).  
- Disable Shop tab: set `SURFACE_SHOP_IN_TABS = false` in `launchSurfaceConfig.ts`.  
- Local mocks: `SHOP_CATALOG_SOURCE=local` only in `__DEV__` / tests.

## Checkout presentation (in-app browser)

Gymly **Buy now** opens the Shopify checkout URL with
`react-native-inappbrowser-reborn`:

- **iOS:** `SFSafariViewController` modal (Done closes → product detail)
- **Android:** Chrome Custom Tabs
- **Fallback:** system browser via `Linking.openURL` if in-app browser is unavailable
- **Not used:** RN / WKWebView for payment (PCI / OAuth guidance)

The exact Storefront `checkoutUrl` is preserved (including cart session query params).
Cart / line Gymly attribution attributes are unchanged.

### Online store password (QA only)

If the Online Store is password-protected, SFSafariView / Custom Tabs will show
Shopify’s password page. During controlled QA, enter the password **manually** in
that UI (“Enter using password”).

- Do **not** put the storefront password in source, `.env`, checkout URLs, or app UI.
- Do **not** attempt to bypass password protection programmatically.
- **Before public release:** remove Online Store password protection in Shopify Admin
  (Online Store → Preferences → Password protection → disable).

### Return / order-success (future — not implemented)

Closing the in-app browser returns the user to the same Gymly product detail screen
and refreshes product state. That is **not** payment confirmation.

Shopify remains the source of truth for completed orders. A later phase could:

1. Configure a Shopify thank-you / order-status redirect (or customer account deep link)
   to an HTTPS Gymly URL already covered by associated domains
   (e.g. `https://gymlyapp.com/...`), **or** a `gymly://shop/...` custom scheme.
2. Handle that URL in the existing auth/deep-link stack to show a lightweight
   “Thanks — check your email / order status in Shopify” screen.
3. Optionally re-fetch Storefront / Admin order by id **only** with a secure backend —
   never invent client-side “order paid” from browser dismiss alone.

Do not treat in-app browser dismiss, cart create, or opening checkout as a sale.
