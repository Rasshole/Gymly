import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';
import {EmptyState} from '@/components/ui/EmptyState';
import {ShopProductCard} from '@/components/shop/ShopProductCard';
import {getShopCatalogRepository} from '@/shop/catalog/getShopCatalogRepository';
import {useSavedShopProductsStore} from '@/store/savedShopProductsStore';
import {useAppStore} from '@/store/appStore';
import {useTranslation, useAppFormat} from '@/i18n';
import type {ShopProduct, ShopProductSort, ShopCategoryId} from '@/types/shop.types';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';
import {FilterChips} from '@/components/ui/FilterChips';
import {
  SHOP_GRID_GAP,
  SHOP_GRID_PAD_H,
  shopGridCardWidth,
} from '@/shop/utils/shopGridLayout';
import {useOptionalBottomTabBarHeight} from '@/hooks/useOptionalBottomTabBarHeight';
import {isShopError} from '@/shop/shopify/shopErrors';

type Props = {
  categoryId?: ShopCategoryId;
  brandId?: string;
  brandName?: string;
  /** Submitted search query only — not live keystrokes. */
  search?: string;
  title?: string;
  /** Hide the in-screen heading when the nav title already covers it. */
  showInlineHeading?: boolean;
};

const PAGE_SIZE = 24;

const SORT_OPTIONS: {key: ShopProductSort; labelKey: string}[] = [
  {key: 'featured', labelKey: 'shop.sort.featured'},
  {key: 'price_asc', labelKey: 'shop.sort.priceAsc'},
  {key: 'price_desc', labelKey: 'shop.sort.priceDesc'},
];

export const ShopProductGridScreen: React.FC<Props> = ({
  categoryId,
  brandId,
  brandName,
  search,
  title,
  showInlineHeading = true,
}) => {
  const {t} = useTranslation();
  const {intlLocale} = useAppFormat();
  const {width: windowWidth} = useWindowDimensions();
  const tabBarHeight = useOptionalBottomTabBarHeight();
  const navigation = useNavigation<StackNavigationProp<ShopStackParamList>>();
  const userId = useAppStore(s => s.user?.id ?? null);
  const savedIds = useSavedShopProductsStore(s => s.savedIds);
  const toggleSaved = useSavedShopProductsStore(s => s.toggleSaved);
  const hydrateForUser = useSavedShopProductsStore(s => s.hydrateForUser);

  const [sort, setSort] = useState<ShopProductSort>('featured');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const requestIdRef = useRef(0);

  const cardWidth = useMemo(
    () => shopGridCardWidth(windowWidth),
    [windowWidth],
  );

  const listBottomPad = spacing.xxxl + tabBarHeight;

  const fetchPage = useCallback(
    async (mode: 'replace' | 'append' | 'refresh') => {
      const reqId = ++requestIdRef.current;
      if (mode === 'replace') {
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const repo = getShopCatalogRepository();
        const page = await repo.listProductsPage({
          categoryId,
          brandId,
          search,
          sort,
          first: PAGE_SIZE,
          after: mode === 'append' ? endCursor ?? undefined : undefined,
        });
        if (reqId !== requestIdRef.current) {
          return;
        }
        setProducts(prev => {
          if (mode === 'append') {
            const seen = new Set(prev.map(p => p.id));
            const merged = [...prev];
            for (const p of page.products) {
              if (!seen.has(p.id)) {
                seen.add(p.id);
                merged.push(p);
              }
            }
            return merged;
          }
          return page.products;
        });
        setHasNextPage(page.pageInfo.hasNextPage);
        setEndCursor(page.pageInfo.endCursor);
      } catch (err) {
        if (reqId !== requestIdRef.current) {
          return;
        }
        const key = isShopError(err)
          ? err.userMessageKey
          : 'shop.errors.loadFailed';
        setError(t(key));
        if (mode !== 'append') {
          setProducts([]);
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [brandId, categoryId, endCursor, search, sort, t],
  );

  useEffect(() => {
    void hydrateForUser(userId);
  }, [hydrateForUser, userId]);

  useEffect(() => {
    setEndCursor(null);
    setHasNextPage(false);
    void fetchPage('replace');
    // Reset pagination when filters change — intentionally omit endCursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, categoryId, search, sort]);

  const heading =
    title ||
    brandName ||
    (categoryId ? t(`shop.categories.${categoryId}`) : t('shop.search.results'));

  if (loading && products.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingLabel}>{t('shop.loading')}</Text>
      </View>
    );
  }

  if (error && products.length === 0) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title={t('shop.errors.title')}
        message={error}
        actionLabel={t('shop.errors.retry')}
        onAction={() => void fetchPage('replace')}
      />
    );
  }

  return (
    <View style={styles.container}>
      {showInlineHeading ? (
        <View style={styles.toolbar}>
          <Text style={styles.heading} numberOfLines={1}>
            {heading}
          </Text>
          <Text style={styles.count}>
            {t('shop.resultsCount', {count: String(products.length)})}
          </Text>
        </View>
      ) : (
        <View style={styles.toolbarCompact}>
          <Text style={styles.count}>
            {t('shop.resultsCount', {count: String(products.length)})}
          </Text>
        </View>
      )}
      <FilterChips
        options={SORT_OPTIONS.map(o => ({
          value: o.key,
          label: t(o.labelKey),
        }))}
        value={sort}
        onChange={setSort}
        style={styles.chips}
      />
      {products.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title={t('shop.empty.resultsTitle')}
          message={t('shop.empty.resultsBody')}
          actionLabel={t('shop.empty.backToShop')}
          onAction={() => navigation.navigate('ShopHome')}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={[styles.list, {paddingBottom: listBottomPad}]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void fetchPage('refresh')}
              tintColor={colors.primary}
            />
          }
          onEndReached={() => {
            if (hasNextPage && !loadingMore && !loading) {
              void fetchPage('append');
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={styles.footerLoader}
                color={colors.primary}
              />
            ) : null
          }
          renderItem={({item}) => (
            <View style={[styles.cell, {width: cardWidth}]}>
              <ShopProductCard
                product={item}
                saved={savedIds.includes(item.id)}
                locale={intlLocale}
                onPress={() =>
                  navigation.navigate('ShopProduct', {productId: item.id})
                }
                onToggleSave={() => void toggleSaved(item.id)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  loadingLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
  toolbar: {
    paddingHorizontal: SHOP_GRID_PAD_H,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  toolbarCompact: {
    paddingHorizontal: SHOP_GRID_PAD_H,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  heading: {
    ...typography.h3,
    color: colors.text,
  },
  count: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  chips: {
    paddingHorizontal: SHOP_GRID_PAD_H,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: SHOP_GRID_PAD_H,
  },
  row: {
    gap: SHOP_GRID_GAP,
    marginBottom: SHOP_GRID_GAP,
    justifyContent: 'flex-start',
  },
  cell: {},
  footerLoader: {
    marginVertical: spacing.lg,
  },
});
