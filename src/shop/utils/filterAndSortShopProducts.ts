import type {ShopCatalogQuery, ShopProduct, ShopProductSort} from '@/types/shop.types';

export function normalizeShopSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function productMatchesSearch(product: ShopProduct, query: string): boolean {
  const q = normalizeShopSearchQuery(query);
  if (!q) {
    return true;
  }
  const haystack = [
    product.title,
    product.brand,
    product.category,
    product.handle,
    ...product.tags,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function sortShopProducts(
  products: readonly ShopProduct[],
  sort: ShopProductSort = 'featured',
): ShopProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'price_asc':
      return copy.sort((a, b) => a.price - b.price || a.title.localeCompare(b.title));
    case 'price_desc':
      return copy.sort((a, b) => b.price - a.price || a.title.localeCompare(b.title));
    case 'featured':
    default:
      return copy.sort((a, b) => {
        const score = (p: ShopProduct) =>
          (p.featured ? 4 : 0) + (p.popular ? 2 : 0) + (p.available ? 1 : 0);
        const diff = score(b) - score(a);
        if (diff !== 0) {
          return diff;
        }
        return a.title.localeCompare(b.title);
      });
  }
}

export function filterAndSortShopProducts(
  products: readonly ShopProduct[],
  query: ShopCatalogQuery = {},
): ShopProduct[] {
  let list = products.filter(p => p.available);

  if (query.ids && query.ids.length > 0) {
    const idSet = new Set(query.ids);
    list = list.filter(p => idSet.has(p.id));
  }
  if (query.categoryId) {
    list = list.filter(p => p.category === query.categoryId);
  }
  if (query.brandId) {
    list = list.filter(p => p.brandId === query.brandId);
  }
  if (query.featuredOnly) {
    list = list.filter(p => p.featured);
  }
  if (query.popularOnly) {
    list = list.filter(p => p.popular);
  }
  if (query.search) {
    list = list.filter(p => productMatchesSearch(p, query.search!));
  }

  return sortShopProducts(list, query.sort ?? 'featured');
}
