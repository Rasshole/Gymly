export type ShopStackParamList = {
  ShopHome: undefined;
  ShopCategory: {
    categoryId: import('@/types/shop.types').ShopCategoryId;
    title?: string;
  };
  ShopSearch: {
    initialQuery?: string;
    brandId?: string;
    brandName?: string;
    categoryId?: import('@/types/shop.types').ShopCategoryId;
  };
  ShopProduct: {
    productId: string;
  };
  SavedProducts: undefined;
};
