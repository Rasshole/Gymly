/**
 * Isolated Shop stack — imported only via LazyShopNavigator (not at app bootstrap).
 */
import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {View, StyleSheet, Text} from 'react-native';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import type {ShopStackParamList} from './shopStackParamList';
import ShopHomeScreen from '@/screens/shop/ShopHomeScreen';
import ShopCategoryScreen from '@/screens/shop/ShopCategoryScreen';
import ShopSearchScreen from '@/screens/shop/ShopSearchScreen';
import ShopProductScreen from '@/screens/shop/ShopProductScreen';
import SavedProductsScreen from '@/screens/shop/SavedProductsScreen';
import {MessagesHeaderButton} from '@/components/navigation/MessagesHeaderButton';
import {SavedProductsHeaderButton} from '@/components/shop/SavedProductsHeaderButton';

const Stack = createStackNavigator<ShopStackParamList>();

const ShopHomeHeaderRight = () => (
  <View style={styles.headerRight}>
    <SavedProductsHeaderButton />
    <MessagesHeaderButton />
  </View>
);

const ShopNavigator = () => {
  const {t} = useTranslation();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.backgroundCard,
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        headerTitleAlign: 'center',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
          color: colors.text,
          letterSpacing: -0.3,
        },
        headerTitleContainerStyle: {
          maxWidth: '62%',
        },
        headerTintColor: colors.text,
        headerBackTitleVisible: false,
        headerBackTitle: t('common.back'),
        cardStyle: {backgroundColor: colors.background},
      }}>
      <Stack.Screen
        name="ShopHome"
        component={ShopHomeScreen}
        options={{
          title: t('tabs.shop'),
          headerRight: () => <ShopHomeHeaderRight />,
        }}
      />
      <Stack.Screen
        name="ShopCategory"
        component={ShopCategoryScreen}
        options={{title: t('shop.categoryTitle')}}
      />
      <Stack.Screen
        name="ShopSearch"
        component={ShopSearchScreen}
        options={{title: t('shop.search.title')}}
      />
      <Stack.Screen
        name="ShopProduct"
        component={ShopProductScreen}
        options={{
          title: t('shop.product.title'),
          headerTitle: ({children}) => (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.productTitle}>
              {children}
            </Text>
          ),
        }}
      />
      <Stack.Screen
        name="SavedProducts"
        component={SavedProductsScreen}
        options={{title: t('shop.saved.title')}}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
    gap: 2,
  },
  productTitle: {
    fontWeight: '700',
    fontSize: 17,
    color: colors.text,
    letterSpacing: -0.3,
    maxWidth: 220,
  },
});

export default ShopNavigator;
