/**
 * Loading Screen
 * Vises lige inden log ind – lilla kettlebell med smiley på hvid baggrund
 */

import React from 'react';
import {View, Image, Text, StyleSheet, ActivityIndicator} from 'react-native';
import colors from '@/theme/colors';

const splashLogo = require('@/assets/images/splash-kettlebell.png');

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <Image source={splashLogo} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      <Text style={styles.label}>Indlæser Gymly…</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  logo: {
    width: 220,
    height: 220,
  },
  spinner: {
    marginTop: 24,
  },
  label: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

export default LoadingScreen;

