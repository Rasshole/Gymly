import React from 'react';
import {TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import colors from '@/theme/colors';
import {radius} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import type {ShopStackParamList} from '@/navigation/shop/shopStackParamList';

type Props = {
  color?: string;
};

export const SavedProductsHeaderButton: React.FC<Props> = ({
  color = colors.text,
}) => {
  const {t} = useTranslation();
  const navigation = useNavigation<StackNavigationProp<ShopStackParamList>>();

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('SavedProducts')}
      style={styles.iconTap}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={t('shop.a11y.savedProducts')}>
      <Icon name="heart-outline" size={24} color={color} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconTap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SavedProductsHeaderButton;
