import React from 'react';
import {View, Text, Image, StyleSheet, Pressable} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {radius, spacing, typography, shadows} from '@/theme/designTokens';
import {GymlyPressable} from '@/components/ui/GymlyPressable';
import type {ShopProduct} from '@/types/shop.types';
import {formatShopPrice, shopDiscountPercent} from '@/shop/utils/formatShopPrice';
import {useTranslation} from '@/i18n';

type Props = {
  product: ShopProduct;
  saved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
  /** Wider card for horizontal carousels */
  variant?: 'grid' | 'carousel';
  locale?: string;
};

export const ShopProductCard: React.FC<Props> = ({
  product,
  saved,
  onPress,
  onToggleSave,
  variant = 'grid',
  locale = 'da-DK',
}) => {
  const {t} = useTranslation();
  const discount = shopDiscountPercent(product.price, product.compareAtPrice);
  const priceLabel = formatShopPrice(product.price, product.currencyCode, locale);
  const compareLabel =
    product.compareAtPrice != null
      ? formatShopPrice(product.compareAtPrice, product.currencyCode, locale)
      : null;
  const imageUri = product.images[0];
  const cardWidth = variant === 'carousel' ? 168 : undefined;

  return (
    <GymlyPressable
      onPress={onPress}
      style={[styles.card, cardWidth != null && {width: cardWidth}]}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={t('shop.a11y.productCard', {
        title: product.title,
        brand: product.brand,
        price: priceLabel,
      })}>
      <View style={styles.imageWrap}>
        {imageUri ? (
          <Image
            source={{uri: imageUri}}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            accessibilityLabel={t('shop.a11y.productImage', {
              title: product.title,
            })}
          />
        ) : (
          <View
            style={styles.placeholder}
            accessibilityLabel={t('shop.product.imagePlaceholder')}>
            <Icon name="image-outline" size={28} color={colors.textMuted} />
          </View>
        )}
        {discount != null ? (
          <View style={styles.saleBadge}>
            <Text style={styles.saleText}>-{discount}%</Text>
          </View>
        ) : null}
        <Pressable
          onPress={e => {
            e.stopPropagation?.();
            onToggleSave();
          }}
          hitSlop={8}
          style={styles.heartBtn}
          accessibilityRole="button"
          accessibilityState={{selected: saved}}
          accessibilityLabel={
            saved ? t('shop.a11y.unsaveProduct') : t('shop.a11y.saveProduct')
          }>
          <Icon
            name={saved ? 'heart' : 'heart-outline'}
            size={20}
            color={saved ? colors.error : colors.text}
          />
        </Pressable>
      </View>
      <Text style={styles.brand} numberOfLines={1}>
        {product.brand}
      </Text>
      <Text style={styles.title} numberOfLines={2}>
        {product.title}
      </Text>
      <View style={styles.priceRow}>
        <Text style={styles.price} numberOfLines={1}>
          {priceLabel}
        </Text>
        {compareLabel ? (
          <Text style={styles.compare} numberOfLines={1}>
            {compareLabel}
          </Text>
        ) : null}
      </View>
    </GymlyPressable>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.sm,
    ...shadows.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.sm,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  saleBadge: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    backgroundColor: colors.error,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  saleText: {
    ...typography.badge,
    color: colors.white,
  },
  heartBtn: {
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  brand: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    ...typography.small,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
    minHeight: 36,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
    minWidth: 0,
  },
  price: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.text,
    flexShrink: 1,
    minWidth: 0,
  },
  compare: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    flexShrink: 1,
    minWidth: 0,
  },
});

export default ShopProductCard;
