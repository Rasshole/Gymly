/**
 * GymlyLogo Component
 * Displays the Gymly app logo
 */

import React from 'react';
import {View, Image, StyleSheet, ImageSourcePropType, ImageResizeMode} from 'react-native';

type GymlyLogoProps = {
  size?: number;
  resizeMode?: ImageResizeMode;
};

const GymlyLogo: React.FC<GymlyLogoProps> = ({size = 64, resizeMode = 'contain'}) => {
  /** Transparent kant (ydre hvid fjernet) — virker på både hvid og grå baggrund */
  const logoImage: ImageSourcePropType = require('@/assets/images/gymly-kettlebell-transparent.png');

  return (
    <View style={[styles.container, {width: size, height: size}]}>
      <Image
        source={logoImage}
        style={[styles.logoImage, {width: size, height: size}]}
        resizeMode={resizeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});

export default GymlyLogo;

