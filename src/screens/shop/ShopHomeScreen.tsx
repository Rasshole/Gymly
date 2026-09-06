/**
 * Shop home — curated native commerce surface (local catalogue Phase 1A).
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {spacing, typography, radius, shadows} from '@/theme/designTokens';
import {SectionHeader} from '@/components/ui/SectionHeader';
import {EmptyState} from '@/components/ui/EmptyState';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {ShopProductCard} from '@/components/shop/ShopProductCard';
import SupplementJarIcon from '@/components/shop/SupplementJarIcon';
import {
  SHOP_LAUNCH_CATEGORIES,
  SHOP_SUPPLEMENTS_ICON,
} from '@/shop/catalog/shopCategories';
import {getShopCatalogRepository} from '@/shop/catalog/getShopCatalogRepository';
import {getShopRecommendationProvider} from '@/shop/recommendations/ShopRecommendationProvider';
import {useSavedShopProductsStore} from '@/store/savedShopProductsStore';
import {useAppStore} from '@/store/appStore';
import {useTranslation, useAppFormat} from '@/i18n';
import type {ShopBrand, ShopProduct} from '@/types/shop.types';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';
import {
  SHOP_GRID_GAP,
  SHOP_GRID_PAD_H,
  shopGridCardWidth,
  shouldNavigateToShopSearch,
} from '@/shop/utils/shopGridLayout';
import {useOptionalBottomTabBarHeight} from '@/hooks/useOptionalBottomTabBarHeight';
import {isShopError} from '@/shop/shopify/shopErrors';

const CATEGORY_CHIP_WIDTH = 76;
const CATEGORY_CHIP_GAP = spacing.sm;
const CATEGORY_SNAP = CATEGORY_CHIP_WIDTH + CATEGORY_CHIP_GAP;

export const ShopHomeScreen: React.FC = () => {
  const {t} = useTranslation();
  const {intlLocale} = useAppFormat();
  const {width: windowWidth} = useWindowDimensions();
  const tabBarHeight = useOptionalBottomTabBarHeight();
  const navigation = useNavigation<StackNavigationProp<ShopStackParamList>>();
  const userId = useAppStore(s => s.user?.id ?? null);
  const recommendedCardWidth = useMemo(
    () => shopGridCardWidth(windowWidth),
    [windowWidth],
  );
  const savedIds = useSavedShopProductsStore(s => s.savedIds);
  const toggleSaved = useSavedShopProductsStore(s => s.toggleSaved);
  const hydrateForUser = useSavedShopProductsStore(s => s.hydrateForUser);

  const [searchDraft, setSearchDraft] = useState('');
  const [featured, setFeatured] = useState<ShopProduct[]>([]);
  const [recommended, setRecommended] = useState<ShopProduct[]>([]);
  const [brands, setBrands] = useState<ShopBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const repo = getShopCatalogRepository();
      const [featuredList, all, brandList] = await Promise.all([
        repo.listProducts({featuredOnly: true, sort: 'featured'}),
        repo.listProducts({sort: 'featured'}),
        repo.listBrands(),
      ]);
      // DEV: recommendations are curated/popular fallback — not personalized.
      const recs = await getShopRecommendationProvider().getRecommended(all, {
        userId,
        hasTrainingSignal: false,
      });
      setFeatured(featuredList);
      setRecommended(recs);
      setBrands(brandList);
    } catch (err) {
      const key = isShopError(err) ? err.userMessageKey : 'shop.errors.loadFailed';
      setError(t(key));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    void hydrateForUser(userId);
  }, [hydrateForUser, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openProduct = (productId: string) => {
    navigation.navigate('ShopProduct', {productId});
  };

  const submitSearch = () => {
    if (!shouldNavigateToShopSearch(searchDraft)) {
      return;
    }
    Keyboard.dismiss();
    navigation.navigate('ShopSearch', {
      initialQuery: searchDraft.trim(),
    });
  };

  if (loading && featured.length === 0 && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingLabel}>{t('shop.loading')}</Text>
      </View>
    );
  }

  if (error && featured.length === 0) {
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {paddingBottom: spacing.xxxl + tabBarHeight},
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.searchWrap}>
        <SocialSearchBar
          value={searchDraft}
          onChangeText={setSearchDraft}
          placeholder={t('shop.search.placeholder')}
          onSubmitEditing={submitSearch}
          returnKeyType="search"
          style={styles.searchBar}
        />
        <Pressable
          onPress={submitSearch}
          style={styles.searchGo}
          accessibilityRole="button"
          accessibilityLabel={t('shop.search.submit')}>
          <Icon name="arrow-forward" size={20} color={colors.white} />
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>{t('shop.home.categories')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CATEGORY_SNAP}
        snapToAlignment="start"
        disableIntervalMomentum
        accessibilityRole="scrollbar"
        accessibilityLabel={t('shop.a11y.categoriesScroll')}
        contentContainerStyle={styles.categoryRow}>
        {SHOP_LAUNCH_CATEGORIES.map(cat => (
          <Pressable
            key={cat.id}
            style={styles.categoryChip}
            onPress={() =>
              navigation.navigate('ShopCategory', {categoryId: cat.id})
            }
            accessibilityRole="button"
            accessibilityLabel={t(cat.labelKey)}>
            <View style={styles.categoryIcon}>
              {cat.icon === SHOP_SUPPLEMENTS_ICON ? (
                <SupplementJarIcon size={22} color={colors.primary} />
              ) : (
                <Icon name={cat.icon as never} size={22} color={colors.primary} />
              )}
            </View>
            <Text style={styles.categoryLabel} numberOfLines={1}>
              {t(cat.labelKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sectionPad}>
        <SectionHeader
          title={t('shop.home.featured')}
          seeAllLabel={t('shop.seeAll')}
          onSeeAll={() => navigation.navigate('ShopSearch', {})}
          alignSeeAllToTitle
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}>
        {featured.map(item => (
          <View key={item.id} style={styles.carouselItem}>
            <ShopProductCard
              product={item}
              variant="carousel"
              saved={savedIds.includes(item.id)}
              locale={intlLocale}
              onPress={() => openProduct(item.id)}
              onToggleSave={() => void toggleSaved(item.id)}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.sectionPad}>
        <SectionHeader title={t('shop.home.brands')} alignSeeAllToTitle />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.brandRow}>
        {brands.map(brand => (
          <Pressable
            key={brand.id}
            style={styles.brandCard}
            onPress={() =>
              navigation.navigate('ShopSearch', {
                brandId: brand.id,
                brandName: brand.name,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={brand.name}>
            <View style={styles.brandAvatar}>
              <Text style={styles.brandInitial}>
                {brand.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.brandName} numberOfLines={2}>
              {brand.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sectionPad}>
        <SectionHeader
          title={t('shop.home.recommended')}
          seeAllLabel={t('shop.seeAll')}
          onSeeAll={() => navigation.navigate('ShopSearch', {})}
          alignSeeAllToTitle
        />
      </View>
      <View style={styles.grid}>
        {recommended.map(item => (
          <View
            key={item.id}
            style={[styles.gridCell, {width: recommendedCardWidth}]}>
            <ShopProductCard
              product={item}
              saved={savedIds.includes(item.id)}
              locale={intlLocale}
              onPress={() => openProduct(item.id)}
              onToggleSave={() => void toggleSaved(item.id)}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxxl,
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
  },
  searchGo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
  sectionLabel: {
    ...typography.h4,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionPad: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  categoryRow: {
    paddingLeft: spacing.lg,
    // Extra trailing pad so the last chip clears; shorter chips peek the next card.
    paddingRight: spacing.xl + CATEGORY_CHIP_WIDTH * 0.35,
    gap: CATEGORY_CHIP_GAP,
  },
  categoryChip: {
    width: CATEGORY_CHIP_WIDTH,
    alignItems: 'center',
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  categoryLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  carousel: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  carouselItem: {
    marginRight: spacing.md,
  },
  brandRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  brandCard: {
    width: 96,
    alignItems: 'center',
  },
  brandAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  brandInitial: {
    ...typography.h3,
    color: colors.primary,
  },
  brandName: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SHOP_GRID_PAD_H,
    gap: SHOP_GRID_GAP,
  },
  gridCell: {
    // width from shopGridCardWidth — left-aligned, never stretch
  },
});

export default ShopHomeScreen;
