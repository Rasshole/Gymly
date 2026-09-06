import React, {useLayoutEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {ShopProductGridScreen} from './ShopProductGridScreen';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';
import {useTranslation} from '@/i18n';

export const ShopCategoryScreen: React.FC = () => {
  const route = useRoute<RouteProp<ShopStackParamList, 'ShopCategory'>>();
  const navigation = useNavigation<StackNavigationProp<ShopStackParamList>>();
  const {t} = useTranslation();
  const {categoryId} = route.params;
  const categoryTitle = t(`shop.categories.${categoryId}`);

  useLayoutEffect(() => {
    navigation.setOptions({title: categoryTitle});
  }, [categoryTitle, navigation]);

  return (
    <View style={styles.container}>
      <ShopProductGridScreen
        categoryId={categoryId}
        title={categoryTitle}
        showInlineHeading={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
});

export default ShopCategoryScreen;
