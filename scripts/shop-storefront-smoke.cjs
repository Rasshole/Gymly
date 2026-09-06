#!/usr/bin/env node
/**
 * Optional live Storefront smoke (Patrick / local machine only).
 * - Reads root `.env` — never prints the Storefront token.
 * - Does not complete a paid purchase.
 * - Exit non-zero on failure.
 *
 * Usage:
 *   node scripts/shop-storefront-smoke.cjs
 *   node scripts/shop-storefront-smoke.cjs --handle=your-product-handle
 */
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    return {};
  }
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#')) {
      continue;
    }
    const i = line.indexOf('=');
    if (i < 0) {
      continue;
    }
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function argValue(name) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const env = {...loadEnv(path.join(root, '.env')), ...process.env};
  const domain = (env.SHOPIFY_STORE_DOMAIN || 'f08uqq-vy.myshopify.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const version = env.SHOPIFY_STOREFRONT_API_VERSION || '2026-04';
  const token = env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN || '';
  const handle = argValue('handle');

  if (!token || /YOUR_|PLACEHOLDER|INSERT/i.test(token)) {
    console.error(
      'SMOKE FAIL: SHOPIFY_STOREFRONT_PUBLIC_TOKEN missing in .env (not printing value).',
    );
    process.exit(2);
  }

  const endpoint = `https://${domain}/api/${version}/graphql.json`;
  console.log(`Store domain: ${domain}`);
  console.log(`API version: ${version}`);
  console.log(`Token present: yes (length ${token.length}, value redacted)`);

  const query = `
    query Smoke($first: Int!, $query: String) {
      products(first: $first, query: $query) {
        nodes {
          id
          handle
          title
          vendor
          availableForSale
          onlineStoreUrl
          priceRange { minVariantPrice { amount currencyCode } }
          variants(first: 5) {
            nodes { id title availableForSale }
          }
        }
      }
    }
  `;

  const variables = {
    first: 5,
    query: handle
      ? `handle:${handle}`
      : 'available_for_sale:true',
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
  });

  if (!res.ok) {
    console.error(`SMOKE FAIL: HTTP ${res.status}`);
    process.exit(1);
  }

  const json = await res.json();
  if (json.errors?.length) {
    console.error('SMOKE FAIL: GraphQL errors (messages only):');
    for (const e of json.errors) {
      console.error(` - ${e.message}`);
    }
    process.exit(1);
  }

  const nodes = json.data?.products?.nodes ?? [];
  console.log(`Products returned: ${nodes.length}`);
  if (nodes.length === 0) {
    console.error(
      'SMOKE FAIL: No products. Publish a demo product to Online Store + Headless (Active), then re-run.',
    );
    process.exit(1);
  }

  const product = nodes[0];
  console.log('First product (no secrets):');
  console.log(
    JSON.stringify(
      {
        id: product.id,
        handle: product.handle,
        title: product.title,
        vendor: product.vendor,
        availableForSale: product.availableForSale,
        currency: product.priceRange?.minVariantPrice?.currencyCode,
        amount: product.priceRange?.minVariantPrice?.amount,
        variantCount: product.variants?.nodes?.length ?? 0,
        firstVariantId: product.variants?.nodes?.[0]?.id ?? null,
      },
      null,
      2,
    ),
  );

  const availableVariant = (product.variants?.nodes ?? []).find(
    v => v.availableForSale,
  );
  if (!availableVariant) {
    console.error('SMOKE FAIL: No available variant for cartCreate test.');
    process.exit(1);
  }

  const cartMutation = `
    mutation CartSmoke($input: CartInput!) {
      cartCreate(input: $input) {
        cart { id checkoutUrl }
        userErrors { message code }
      }
    }
  `;

  const cartRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({
      query: cartMutation,
      variables: {
        input: {
          lines: [
            {
              merchandiseId: availableVariant.id,
              quantity: 1,
              attributes: [
                {key: 'gymly_product_id', value: product.id},
                {key: 'gymly_variant_id', value: availableVariant.id},
                {key: 'gymly_vendor', value: product.vendor || 'Gymly'},
              ],
            },
          ],
          attributes: [
            {key: 'gymly_sales_source', value: 'gymly_app_smoke'},
            {key: 'gymly_product_id', value: product.id},
            {key: 'gymly_variant_id', value: availableVariant.id},
            {key: 'gymly_vendor', value: product.vendor || 'Gymly'},
            {key: 'gymly_product_handle', value: product.handle},
          ],
          buyerIdentity: {countryCode: 'DK'},
        },
      },
    }),
  });

  const cartJson = await cartRes.json();
  if (cartJson.errors?.length) {
    console.error('SMOKE FAIL: cartCreate GraphQL errors:');
    for (const e of cartJson.errors) {
      console.error(` - ${e.message}`);
    }
    process.exit(1);
  }

  const payload = cartJson.data?.cartCreate;
  if (payload?.userErrors?.length) {
    console.error('SMOKE FAIL: cart userErrors:');
    for (const e of payload.userErrors) {
      console.error(` - ${e.message}`);
    }
    process.exit(1);
  }

  const checkoutUrl = payload?.cart?.checkoutUrl || '';
  if (!/^https:\/\//i.test(checkoutUrl)) {
    console.error('SMOKE FAIL: checkout URL missing or not HTTPS');
    process.exit(1);
  }

  let host = '';
  try {
    host = new URL(checkoutUrl).hostname;
  } catch {
    console.error('SMOKE FAIL: checkout URL unparseable');
    process.exit(1);
  }

  const allowed =
    host === domain ||
    host.endsWith('.myshopify.com') ||
    host.endsWith('.shopify.com') ||
    host.endsWith('.gymlyapp.com');
  if (!allowed) {
    console.error(`SMOKE FAIL: checkout host not allowed: ${host}`);
    process.exit(1);
  }

  console.log('Cart create: OK');
  console.log(`Checkout host: ${host}`);
  console.log('Checkout URL scheme: https (full URL redacted for log safety)');
  console.log(
    'STOP: Do not complete a paid purchase. Open checkout only to confirm it loads, then cancel.',
  );
  console.log(
    'REMINDER: Return any temporary Active demo product to Draft after device QA.',
  );
  console.log('SMOKE PASS');
}

main().catch(err => {
  console.error('SMOKE FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
