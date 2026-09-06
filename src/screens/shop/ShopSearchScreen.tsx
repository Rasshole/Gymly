import React, {useEffect, useLayoutEffect, useState} from 'react';
import {View, StyleSheet, Keyboard} from 'react-native';
import {RouteProp, useRoute} from '@react-navigation/native';
import colors from '@/theme/colors';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {spacing} from '@/theme/designTokens';
import {ShopProductGridScreen} from './ShopProductGridScreen';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';
import {useTranslation} from '@/i18n';
import {trimShopSearchQuery} from '@/shop/utils/shopGridLayout';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

export const ShopSearchScreen: React.FC = () => {
  const route = useRoute<RouteProp<ShopStackParamList, 'ShopSearch'>>();
  const navigation = useNavigation<StackNavigationProp<ShopStackParamList>>();
  const {t} = useTranslation();
  const {
    initialQuery = '',
    brandId,
    brandName,
    categoryId,
  } = route.params ?? {};
  const [draft, setDraft] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(trimShopSearchQuery(initialQuery));

  useEffect(() => {
    const trimmed = trimShopSearchQuery(initialQuery);
    setDraft(initialQuery);
    setSubmitted(trimmed);
  }, [initialQuery]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: brandName || t('shop.search.title'),
    });
  }, [brandName, navigation, t]);

  const submit = () => {
    const q = trimShopSearchQuery(draft);
    Keyboard.dismiss();
    setSubmitted(q);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <SocialSearchBar
          value={draft}
          onChangeText={setDraft}
          placeholder={t('shop.search.placeholder')}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={submit}
        />
      </View>
      <ShopProductGridScreen
        search={submitted || undefined}
        brandId={brandId}
        brandName={brandName}
        categoryId={categoryId}
        showInlineHeading={false}
        title={
          brandName
            ? brandName
            : submitted
              ? t('shop.search.resultsFor', {query: submitted})
              : t('shop.search.results')
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});

export default ShopSearchScreen;
