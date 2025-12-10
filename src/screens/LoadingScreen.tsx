/**
 * Loading Screen
 */

import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {colors} from '@/theme/colors';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
  },
});

export default LoadingScreen;

