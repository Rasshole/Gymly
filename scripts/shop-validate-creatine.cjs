#!/usr/bin/env node
/**
 * Live validation for controlled product: Creatine Monohydrate – 300 g
 * - Reads gitignored `.env` only
 * - Never prints the Storefront token or full checkout URL
 * - Does not complete a paid purchase
 *
 * Usage:
 *   node scripts/shop-validate-creatine.cjs
 */
const fs = require('fs');
const path = require('path');

const TARGET_TITLE_HINT = '300';

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

function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname.split('/').slice(0, 3).join('/')}…`;
  } catch {
    return '(invalid-url)';
  }
}

async function storefront(endpoint, token, query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({query, variables}),
  });
  const json = await res.json().catch(() => ({}));
  return {ok: res.ok, status: res.status, json};
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const env = {...loadEnv(path.join(root, '.env')), ...process.env};
  const domain = (env.SHOPIFY_STORE_DOMAIN || 'f08uqq-vy.myshopify.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const version = env.SHOPIFY_STOREFRONT_API_VERSION || '2026-04';
  const token = env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN || '';
  const endpoint = `https://${domain}/api/${version}/graphql.json`;

  const report = {
    productTitle: 'Creatine Monohydrate – 300 g',
    storeDomain: domain,
    apiVersion: version,
    tokenPresent: false,
    headlessChannelReachable: null,
    productFound: false,
    productId: null,
    handle: null,
    vendor: null,
    availableForSale: null,
    currency: null,
    price: null,
    compareAt: null,
    imageCount: 0,
    variantCount: 0,
    availableVariantId: null,
    cartCreateOk: false,
    checkoutHost: null,
    checkoutHttps: false,
    attributesSent: [
      'gymly_sales_source',
      'gymly_product_id',
      'gymly_variant_id',
      'gymly_vendor',
      'gymly_product_handle',
    ],
    blockers: [],
    reminder: 'Return “Creatine Monohydrate – 300 g” to Draft after QA.',
  };

  if (!token || /YOUR_|PLACEHOLDER|INSERT/i.test(token)) {
    report.blockers.push(
      'Missing SHOPIFY_STOREFRONT_PUBLIC_TOKEN in gitignored root .env',
    );
    console.log(JSON.stringify(report, null, 2));
    console.error(
      '\nBLOCKED: Create `.env` from `.env.example` with your public Storefront token, then re-run:\n  node scripts/shop-validate-creatine.cjs\n',
    );
    process.exit(2);
  }
  report.tokenPresent = true;

  // Storefront token is bound to one sales channel (Headless / Gymly Mobile App).
  // If this query succeeds and returns the product, it is published to that channel.
  const productsQuery = `
    query FindCreatine($first: Int!, $query: String!) {
      products(first: $first, query: $query) {
        nodes {
          id
          handle
          title
          vendor
          description
          availableForSale
          onlineStoreUrl
          featuredImage { url }
          images(first: 8) { nodes { url } }
          priceRange { minVariantPrice { amount currencyCode } }
          compareAtPriceRange { minVariantPrice { amount currencyCode } }
          variants(first: 25) {
            nodes {
              id
              title
              availableForSale
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
            }
          }
        }
      }
    }
  `;

  const searchAttempts = [
    'title:Creatine Monohydrate* available_for_sale:true',
    'title:Creatine*',
    "title:'Creatine Monohydrate'",
  ];

  let product = null;
  let lastHttp = null;
  for (const q of searchAttempts) {
    const {ok, status, json} = await storefront(endpoint, token, productsQuery, {
      first: 20,
      query: q,
    });
    lastHttp = status;
    if (!ok) {
      report.blockers.push(`Storefront HTTP ${status}`);
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    if (json.errors?.length) {
      report.blockers.push(
        `GraphQL: ${json.errors.map(e => e.message).join('; ')}`,
      );
      // Still try next query shape if partial
      continue;
    }
    report.headlessChannelReachable = true;
    const nodes = json.data?.products?.nodes ?? [];
    product =
      nodes.find(
        n =>
          String(n.title || '')
            .toLowerCase()
            .includes('creatine') &&
          String(n.title || '').includes(TARGET_TITLE_HINT),
      ) ||
      nodes.find(n =>
        String(n.title || '')
          .toLowerCase()
          .includes('creatine monohydrate'),
      ) ||
      null;
    if (product) {
      break;
    }
  }

  if (!report.headlessChannelReachable && lastHttp === 200) {
    report.headlessChannelReachable = true;
  }

  if (!product) {
    report.blockers.push(
      'Product not returned by Storefront API for this token’s channel. Confirm “Creatine Monohydrate – 300 g” is Active and published to the Headless / Gymly Mobile App sales channel that owns this Storefront token (not only Online Store).',
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  report.productFound = true;
  report.productId = product.id;
  report.handle = product.handle;
  report.vendor = product.vendor;
  report.availableForSale = product.availableForSale;
  report.currency = product.priceRange?.minVariantPrice?.currencyCode ?? null;
  report.price = product.priceRange?.minVariantPrice?.amount ?? null;
  report.compareAt =
    product.compareAtPriceRange?.minVariantPrice?.amount ?? null;
  report.imageCount =
    (product.images?.nodes || []).filter(i => i?.url).length ||
    (product.featuredImage?.url ? 1 : 0);
  report.variantCount = product.variants?.nodes?.length ?? 0;

  const availableVariant = (product.variants?.nodes || []).find(
    v => v.availableForSale,
  );
  report.availableVariantId = availableVariant?.id ?? null;

  if (!product.availableForSale || !availableVariant) {
    report.blockers.push('Product or all variants unavailable for sale');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const cartMutation = `
    mutation CartValidate($input: CartInput!) {
      cartCreate(input: $input) {
        cart { id checkoutUrl }
        userErrors { message code field }
      }
    }
  `;

  const cartInput = {
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
      {key: 'gymly_sales_source', value: 'gymly_app_ios'},
      {key: 'gymly_product_id', value: product.id},
      {key: 'gymly_variant_id', value: availableVariant.id},
      {key: 'gymly_vendor', value: product.vendor || 'Gymly'},
      {key: 'gymly_product_handle', value: product.handle},
    ],
    buyerIdentity: {countryCode: 'DK'},
  };

  const cart = await storefront(endpoint, token, cartMutation, {
    input: cartInput,
  });
  if (!cart.ok) {
    report.blockers.push(`cartCreate HTTP ${cart.status}`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  if (cart.json.errors?.length) {
    report.blockers.push(
      `cartCreate GraphQL: ${cart.json.errors.map(e => e.message).join('; ')}`,
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const payload = cart.json.data?.cartCreate;
  if (payload?.userErrors?.length) {
    report.blockers.push(
      `cart userErrors: ${payload.userErrors.map(e => e.message).join('; ')}`,
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const checkoutUrl = payload?.cart?.checkoutUrl || '';
  report.checkoutHttps = /^https:\/\//i.test(checkoutUrl);
  try {
    report.checkoutHost = new URL(checkoutUrl).hostname;
  } catch {
    report.checkoutHost = null;
  }

  const hostOk =
    report.checkoutHost &&
    (report.checkoutHost === domain ||
      report.checkoutHost.endsWith('.myshopify.com') ||
      report.checkoutHost.endsWith('.shopify.com') ||
      report.checkoutHost.endsWith('.gymlyapp.com'));

  if (!report.checkoutHttps || !hostOk) {
    report.blockers.push(
      `Invalid checkout URL host/scheme: ${report.checkoutHost || 'none'}`,
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  report.cartCreateOk = true;

  console.log(JSON.stringify(report, null, 2));
  console.log('\nPASS: Storefront can see Creatine + cartCreate issued HTTPS checkout.');
  console.log(
    `Checkout (redacted): ${redactUrl(checkoutUrl)}`,
  );
  console.log(
    'STOP: Do not complete a paid purchase. Open checkout only to confirm the page loads, then cancel.',
  );
  console.log(
    'REMINDER: Return “Creatine Monohydrate – 300 g” to Draft (or unpublish from Headless) after device QA.',
  );
}

main().catch(err => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
