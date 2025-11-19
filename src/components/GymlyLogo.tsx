/**
 * GymlyLogo Component
 * Displays the Gymly app logo
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

type GymlyLogoProps = {
  size?: number;
};

const GymlyLogo: React.FC<GymlyLogoProps> = ({size = 64}) => {
  return (
    <View style={[styles.container, {width: size, height: size}]}>
      <View style={[styles.logoCircle, {width: size, height: size, borderRadius: size / 2}]}>
        <Text style={[styles.logoText, {fontSize: size * 0.4}]}>G</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontFamily: 'System',
  },
});

export default GymlyLogo;

