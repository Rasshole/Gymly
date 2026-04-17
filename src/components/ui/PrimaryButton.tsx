/**
 * PrimaryButton – Primary CTA button
 * Convenience wrapper for Button with primary variant
 */

import React from 'react';
import Button from './Button';
import {ViewStyle, TextStyle} from 'react-native';

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  size = 'md',
  disabled,
  loading,
  fullWidth,
  style,
  textStyle,
}) => (
  <Button
    title={title}
    onPress={onPress}
    variant="primary"
    size={size}
    disabled={disabled}
    loading={loading}
    fullWidth={fullWidth}
    style={style}
    textStyle={textStyle}
  />
);
