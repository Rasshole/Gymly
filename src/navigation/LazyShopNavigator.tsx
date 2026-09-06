/**
 * Defers Shop stack + catalogue modules until the Shop tab is first mounted.
 */
import React, {useEffect, useState} from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {InteractionManager} from 'react-native';
import colors from '@/theme/colors';

type ShopNavigatorComponent = React.ComponentType;

const LazyShopNavigator = () => {
  const [Navigator, setNavigator] = useState<ShopNavigatorComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        setNavigator(() => require('./shop/ShopNavigator').default);
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, []);

  if (!Navigator) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <Navigator />;
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});

export default LazyShopNavigator;
