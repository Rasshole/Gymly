import React, {useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Text,
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
import type {ShopProduct} from '@/types/shop.types';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';
import {
  SHOP_GRID_GAP,
  SHOP_GRID_PAD_H,
  shopGridCardWidth,
} from '@/shop/utils/shopGridLayout';
import {useOptionalBottomTabBarHeight} from '@/hooks/useOptionalBottomTabBarHeight';

export const SavedProductsScreen: React.FC = () => {
  const {t} = useTranslation();
  const {intlLocale} = useAppFormat();
  const {width: windowWidth} = useWindowDimensions();
  const tabBarHeight = useOptionalBottomTabBarHeight();
  const navigation = useNavigation<StackNavigationProp<ShopStackParamList>>();
  const userId = useAppStore(s => s.user?.id ?? null);
  const savedIds = useSavedShopProductsStore(s => s.savedIds);
  const toggleSaved = useSavedShopProductsStore(s => s.toggleSaved);
  const hydrateForUser = useSavedShopProductsStore(s => s.hydrateForUser);

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cardWidth = useMemo(
    () => shopGridCardWidth(windowWidth),
    [windowWidth],
  );

  useLayoutEffect(() => {
    navigation.setOptions({title: t('shop.saved.title')});
  }, [navigation, t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (savedIds.length === 0) {
        setProducts([]);
        return;
      }
      const repo = getShopCatalogRepository();
      const list = await repo.listProducts({ids: savedIds, sort: 'featured'});
      const byId = new Map(list.map(p => [p.id, p]));
      setProducts(
        savedIds.map(id => byId.get(id)).filter(Boolean) as ShopProduct[],
      );
    } catch {
      setError(t('shop.errors.loadFailed'));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [savedIds, t]);

  useEffect(() => {
    void hydrateForUser(userId);
  }, [hydrateForUser, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingLabel}>{t('shop.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title={t('shop.errors.title')}
        message={error}
        actionLabel={t('shop.errors.retry')}
        onAction={() => void load()}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon="heart-outline"
        title={t('shop.saved.emptyTitle')}
        message={t('shop.saved.emptyBody')}
        actionLabel={t('shop.empty.backToShop')}
        onAction={() => navigation.navigate('ShopHome')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={[
          styles.list,
          {paddingBottom: spacing.xxxl + tabBarHeight},
        ]}
        columnWrapperStyle={styles.row}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  loadingLabel: {...typography.small, color: colors.textSecondary},
  list: {
    paddingHorizontal: SHOP_GRID_PAD_H,
    paddingTop: spacing.md,
  },
  row: {
    gap: SHOP_GRID_GAP,
    marginBottom: SHOP_GRID_GAP,
    justifyContent: 'flex-start',
  },
  cell: {},
});

export default SavedProductsScreen;
