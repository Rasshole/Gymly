import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import {spacing, typography, radius, shadows} from '@/theme/designTokens';
import {EmptyState} from '@/components/ui/EmptyState';
import {PrimaryButton} from '@/components/ui/PrimaryButton';
import {ShopProductCard} from '@/components/shop/ShopProductCard';
import {SectionHeader} from '@/components/ui/SectionHeader';
import {getShopCatalogRepository} from '@/shop/catalog/getShopCatalogRepository';
import {
  buildShopCtaHint,
  buildShopCtaLabel,
  isShopPurchaseDisabled,
  purchaseShopProduct,
} from '@/shop/destination/openProductDestination';
import {formatShopPrice, shopDiscountPercent} from '@/shop/utils/formatShopPrice';
import {
  shopProductFooterPaddingBottom,
  shopProductScrollPaddingBottom,
} from '@/shop/utils/shopProductFooterLayout';
import {useSavedShopProductsStore} from '@/store/savedShopProductsStore';
import {useAppStore} from '@/store/appStore';
import {useTranslation, useAppFormat} from '@/i18n';
import {isShopError} from '@/shop/shopify/shopErrors';
import type {ShopProduct, ShopProductVariant} from '@/types/shop.types';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';

export const ShopProductScreen: React.FC = () => {
  const {t} = useTranslation();
  const {intlLocale} = useAppFormat();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ShopStackParamList, 'ShopProduct'>>();
  const navigation = useNavigation<StackNavigationProp<ShopStackParamList>>();
  const {productId} = route.params;

  const userId = useAppStore(s => s.user?.id ?? null);
  const savedIds = useSavedShopProductsStore(s => s.savedIds);
  const toggleSaved = useSavedShopProductsStore(s => s.toggleSaved);
  const hydrateForUser = useSavedShopProductsStore(s => s.hydrateForUser);

  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [related, setRelated] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const repo = getShopCatalogRepository();
      const p = await repo.getProductById(productId);
      if (!p) {
        setProduct(null);
        setError(t('shop.errors.productNotFound'));
        return;
      }
      setProduct(p);
      const preferred =
        p.variants.find(v => v.available)?.id ?? p.variants[0]?.id ?? null;
      setSelectedVariantId(preferred);
      const rel = await repo.listRelated(productId, 4);
      setRelated(rel);
    } catch (err) {
      const key = isShopError(err) ? err.userMessageKey : 'shop.errors.loadFailed';
      setError(t(key));
    } finally {
      setLoading(false);
    }
  }, [productId, t]);

  useEffect(() => {
    void hydrateForUser(userId);
  }, [hydrateForUser, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: product?.title?.trim() || t('shop.product.title'),
    });
  }, [navigation, product?.title, t]);

  const selectedVariant: ShopProductVariant | null = useMemo(() => {
    if (!product) {
      return null;
    }
    return (
      product.variants.find(v => v.id === selectedVariantId) ??
      product.variants.find(v => v.available) ??
      product.variants[0] ??
      null
    );
  }, [product, selectedVariantId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !product) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title={t('shop.errors.title')}
        message={error ?? t('shop.errors.productNotFound')}
        actionLabel={t('shop.errors.retry')}
        onAction={() => void load()}
      />
    );
  }

  const saved = savedIds.includes(product.id);
  const displayPrice = selectedVariant?.price ?? product.price;
  const displayCompare =
    selectedVariant?.compareAtPrice !== undefined
      ? selectedVariant.compareAtPrice
      : product.compareAtPrice;
  const discount = shopDiscountPercent(displayPrice, displayCompare);
  const priceLabel = formatShopPrice(
    displayPrice,
    product.currencyCode,
    intlLocale,
  );
  const compareLabel =
    displayCompare != null
      ? formatShopPrice(displayCompare, product.currencyCode, intlLocale)
      : null;
  const heroImage = product.images[0];
  const purchaseDisabled = isShopPurchaseDisabled(product) || opening;
  const ctaUnavailableHint =
    product.salesModel === 'affiliate' && isShopPurchaseDisabled(product)
      ? t('shop.errors.affiliateUnavailable')
      : !product.available || (selectedVariant && !selectedVariant.available)
        ? t('shop.errors.soldOut')
        : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingBottom: shopProductScrollPaddingBottom(insets.bottom)},
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {heroImage ? (
            <Image
              source={{uri: heroImage}}
              style={styles.heroImage}
              resizeMode="cover"
              accessibilityLabel={t('shop.a11y.productImage', {
                title: product.title,
              })}
            />
          ) : (
            <View style={styles.heroInner}>
              <Icon name="image-outline" size={40} color={colors.textMuted} />
              <Text style={styles.heroHint}>
                {t('shop.product.imagePlaceholder')}
              </Text>
            </View>
          )}
          <Pressable
            style={styles.heart}
            onPress={() => void toggleSaved(product.id)}
            accessibilityRole="button"
            accessibilityState={{selected: saved}}
            accessibilityLabel={
              saved ? t('shop.a11y.unsaveProduct') : t('shop.a11y.saveProduct')
            }>
            <Icon
              name={saved ? 'heart' : 'heart-outline'}
              size={24}
              color={saved ? colors.error : colors.text}
            />
          </Pressable>
          {discount != null ? (
            <View style={styles.saleBadge}>
              <Text style={styles.saleText}>-{discount}%</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.brand}>{product.brand}</Text>
        <Text style={styles.title}>{product.title}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{priceLabel}</Text>
          {compareLabel ? <Text style={styles.compare}>{compareLabel}</Text> : null}
        </View>

        <Text style={styles.meta}>
          {t(`shop.categories.${product.category}`)}
          {' · '}
          {product.salesModel === 'gymly'
            ? t('shop.salesModel.gymly')
            : t('shop.salesModel.affiliate')}
        </Text>

        <Text style={styles.description}>{product.description}</Text>

        {product.variants.length > 0 ? (
          <View style={styles.variants}>
            <Text style={styles.variantHeading}>{t('shop.product.variants')}</Text>
            <View style={styles.variantRow}>
              {product.variants.map(v => {
                const selected = v.id === selectedVariant?.id;
                return (
                  <Pressable
                    key={v.id}
                    disabled={!v.available}
                    onPress={() => setSelectedVariantId(v.id)}
                    style={[
                      styles.variantChip,
                      selected && styles.variantChipSelected,
                      !v.available && styles.variantUnavailable,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{selected, disabled: !v.available}}
                    accessibilityLabel={v.title}>
                    <Text
                      style={[
                        styles.variantText,
                        selected && styles.variantTextSelected,
                        !v.available && styles.variantTextUnavailable,
                      ]}>
                      {v.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.sellerBox}>
          <Icon name="storefront-outline" size={20} color={colors.primary} />
          <Text style={styles.sellerText}>
            {product.salesModel === 'gymly'
              ? t('shop.product.sellerGymly')
              : t('shop.product.sellerBrand', {brand: product.brand})}
          </Text>
        </View>

        {related.length > 0 ? (
          <>
            <SectionHeader title={t('shop.product.related')} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedRow}>
              {related.map(item => (
                <View key={item.id} style={styles.relatedItem}>
                  <ShopProductCard
                    product={item}
                    variant="carousel"
                    saved={savedIds.includes(item.id)}
                    locale={intlLocale}
                    onPress={() =>
                      navigation.push('ShopProduct', {productId: item.id})
                    }
                    onToggleSave={() => void toggleSaved(item.id)}
                  />
                </View>
              ))}
            </ScrollView>
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {paddingBottom: shopProductFooterPaddingBottom(insets.bottom)},
        ]}>
        <Text style={styles.ctaHint}>
          {ctaUnavailableHint ?? buildShopCtaHint(product, t)}
        </Text>
        <PrimaryButton
          title={buildShopCtaLabel(product, t)}
          loading={opening}
          disabled={purchaseDisabled}
          onPress={() => {
            if (openingRef.current || opening) {
              return;
            }
            openingRef.current = true;
            setOpening(true);
            void (async () => {
              try {
                const result = await purchaseShopProduct({
                  product,
                  variant: selectedVariant,
                  context: {
                    productId: product.id,
                    brand: product.brand,
                    category: product.category,
                    salesModel: product.salesModel,
                    placement: 'product_detail',
                  },
                });
                // After in-app checkout dismiss (or external open), refresh catalogue
                // state. Closing checkout ≠ order completed — Shopify remains SoT.
                if (result.ok) {
                  void load();
                }
              } catch {
                // purchaseShopProduct alerts on known failures; catch anything else.
                Alert.alert(t('shop.errors.title'), t('shop.errors.checkoutFailed'));
              } finally {
                openingRef.current = false;
                setOpening(false);
              }
            })();
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {},
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  hero: {
    height: 280,
    backgroundColor: colors.surfaceLight,
    margin: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroImage: {width: '100%', height: '100%'},
  heroInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  heart: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  saleBadge: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    backgroundColor: colors.error,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  saleText: {...typography.badge, color: colors.white},
  brand: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  price: {...typography.h3, color: colors.text},
  compare: {
    ...typography.body,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  meta: {
    ...typography.small,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    lineHeight: 24,
  },
  variants: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  variantHeading: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  variantRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  variantChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  variantChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '14',
  },
  variantUnavailable: {opacity: 0.45},
  variantText: {...typography.small, fontWeight: '600', color: colors.text},
  variantTextSelected: {color: colors.primary},
  variantTextUnavailable: {textDecorationLine: 'line-through'},
  sellerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sellerText: {...typography.small, color: colors.textSecondary, flex: 1},
  relatedRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  relatedItem: {marginRight: spacing.md},
  footer: {
    // Explicit edges — do not use padding shorthand + paddingBottom override
    // (avoids stacking extra bottom space under Buy now).
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundCard,
    gap: spacing.sm,
  },
  ctaHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

export default ShopProductScreen;
