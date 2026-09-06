# Shop release QA — Patrick device checklist (Phase 1B)

Do **not** submit App Store / Play builds from this checklist.  
Do **not** paste Storefront tokens into chat or commits.  
Do **not** complete a paid purchase.

# Live Storefront validation — Creatine Monohydrate – 300 g

Controlled product currently Active for QA.

## Headless / Gymly Mobile App channel (required)

The Storefront public token is bound to **one** sales channel (Headless / custom app,
often named **Gymly Mobile App**).

Before device testing, in Shopify Admin → product **Creatine Monohydrate – 300 g**:

1. Status: **Active**  
2. Sales channels include **both**:
   - Online Store (optional for web)
   - **Headless / Gymly Mobile App** (required for the app Storefront token)  
3. If the app catalogue stays empty while Admin shows “4 channels”, open the product’s
   channel list and confirm the channel that owns your Storefront token is checked.

**Proof used by automation:** if `node scripts/shop-validate-creatine.cjs` finds the
product, it is published to the token’s Headless channel. Admin API channel listing is
not used in the mobile app.

## Local `.env` (gitignored)

```bash
cp .env.example .env
# set SHOPIFY_STOREFRONT_PUBLIC_TOKEN=<public token only>
node scripts/shop-validate-creatine.cjs
```

Never commit `.env`. Never paste the token into chat.

## After QA

Set **Creatine Monohydrate – 300 g** back to **Draft** (or remove Headless publication).

## iPhone checklist

### Shop catalogue
- [ ] Open **Shop** tab  
- [ ] Confirm products load (not empty config error; not Phase 1A mock brands if live)  
- [ ] Locate the controlled Shopify product by title  
- [ ] Confirm image, title, vendor, price, compare-at (if set)  

### Search / category / save
- [ ] Search for the product title → it appears  
- [ ] Open its category/collection → it appears (or empty only if collection missing)  
- [ ] Save (heart) → appears under Saved  
- [ ] Unsave → removed from Saved  

### Product detail + checkout (Gymly)
- [ ] Open product detail → **bottom tab bar hidden**  
- [ ] Change variant if multiple available  
- [ ] Tap **Buy now** → loading prevents double-tap  
- [ ] Shopify checkout opens **in-app** (SFSafariView / Custom Tabs), not a full browser jump  
- [ ] If Online Store password is on: manually “Enter using password” (do not automate)  
- [ ] Confirm line item / price look correct  
- [ ] Tap **Done/Close** → return to the **same** product detail (state refreshed)  
- [ ] **Cancel / return** without paying  
- [ ] Back from product → tab bar restored  
- [ ] Before public release: disable Online Store password protection 

### Messages / navigation
- [ ] Header Messages → one **Messages** title only (no duplicate in-content H1)  
- [ ] Conversations still open; back works  

### Affiliate safety (fixtures / Admin metafields — no fake partner publish required for automated coverage)
Automated tests cover configured / untracked / unavailable. On device, optionally set metafields on a **Draft** affiliate catalogue product and publish temporarily only if you need visual CTA checks:

| State | Metafields | Expected CTA |
|-------|------------|--------------|
| configured | `affiliate` + tracked HTTPS URL with `aff_id`/`utm_*` (or `gymly_affiliate_tracked=true`) | **View at …** enabled |
| untracked | `affiliate` + plain HTTPS product URL | CTA **disabled** |
| unavailable | `affiliate` + empty/http URL | CTA **disabled** |

Customer UI must **not** show commission % or words like configured/untracked.

## After testing (mandatory)

1. Set the controlled demo product back to **Draft** (or unpublish from Headless / Online Store).  
2. Confirm it no longer appears in the app after refresh.  
3. Do not leave demo/QA products publicly available.
