/**
 * Storefront GraphQL documents for catalogue + cart (API 2026-04).
 *
 * Metafields: custom.gymly_* must be exposed to the Storefront API
 * (Admin → Metafields → Storefront access, or metafieldStorefrontVisibilityCreate).
 */

export const PRODUCT_FIELDS = `
  id
  handle
  title
  description
  vendor
  productType
  tags
  availableForSale
  onlineStoreUrl
  createdAt
  updatedAt
  featuredImage {
    url
    altText
  }
  images(first: 8) {
    nodes {
      url
      altText
    }
  }
  priceRange {
    minVariantPrice {
      amount
      currencyCode
    }
  }
  compareAtPriceRange {
    minVariantPrice {
      amount
      currencyCode
    }
  }
  variants(first: 50) {
    nodes {
      id
      title
      availableForSale
      selectedOptions {
        name
        value
      }
      price {
        amount
        currencyCode
      }
      compareAtPrice {
        amount
        currencyCode
      }
      image {
        url
      }
    }
  }
  mfDestination: metafield(namespace: "custom", key: "gymly_destination_type") {
    value
  }
  mfAffiliate: metafield(namespace: "custom", key: "gymly_affiliate_url") {
    value
  }
  mfAffiliateTracked: metafield(namespace: "custom", key: "gymly_affiliate_tracked") {
    value
  }
  mfFeatured: metafield(namespace: "custom", key: "gymly_featured") {
    value
  }
  mfCategory: metafield(namespace: "custom", key: "gymly_category") {
    value
  }
  mfSort: metafield(namespace: "custom", key: "gymly_sort_priority") {
    value
  }
  mfPriceVerifiedAt: metafield(namespace: "custom", key: "gymly_price_verified_at") {
    value
  }
`;

export const PRODUCTS_QUERY = `
  query ShopProducts(
    $first: Int!
    $after: String
    $query: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${PRODUCT_FIELDS}
      }
    }
  }
`;

export const PRODUCT_BY_ID_QUERY = `
  query ShopProductById(
    $id: ID!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    product(id: $id) {
      ${PRODUCT_FIELDS}
    }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = `
  query ShopCollectionProducts(
    $handle: String!
    $first: Int!
    $after: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${PRODUCT_FIELDS}
        }
      }
    }
  }
`;

export const CART_CREATE_MUTATION = `
  mutation ShopCartCreate(
    $input: CartInput!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;
