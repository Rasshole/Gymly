/**
 * GymlyLogo Component
 * Displays the Gymly app logo
 */

import React from 'react';
import {View, Image, StyleSheet, ImageSourcePropType} from 'react-native';

type GymlyLogoProps = {
  size?: number;
};

const GymlyLogo: React.FC<GymlyLogoProps> = ({size = 64}) => {
  const logoImage: ImageSourcePropType = require('@/assets/images/gymly-logo.png');
  
  return (
    <View style={[styles.container, {width: size, height: size}]}>
      <Image
        source={logoImage}
        style={[styles.logoImage, {width: size, height: size}]}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});

export default GymlyLogo;

