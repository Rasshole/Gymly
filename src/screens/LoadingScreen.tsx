/**
 * Loading Screen
 * Vises lige inden log ind – lilla kettlebell med smiley på hvid baggrund
 */

import React from 'react';
import {View, Image, StyleSheet} from 'react-native';

const splashLogo = require('@/assets/images/splash-kettlebell.png');

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <Image source={splashLogo} style={styles.logo} resizeMode="contain" />
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
});

export default LoadingScreen;

