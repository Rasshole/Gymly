import React, {useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {typography} from '@/theme/designTokens';
import {SOCIAL_PRIMARY_MIN_HEIGHT, SOCIAL_PRIMARY_RADIUS} from './socialUiTokens';

export type SocialPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  iconName?: string;
  style?: StyleProp<ViewStyle>;
};

const SocialPrimaryButton: React.FC<SocialPrimaryButtonProps> = ({
  label,
  onPress,
  disabled,
  loading,
  iconName,
  style,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 6,
      tension: 400,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
      tension: 320,
    }).start();
  };

  return (
    <Animated.View style={[{transform: [{scale}]}, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled || loading}
        style={({pressed}) => [
          styles.btn,
          (disabled || loading) && styles.btnDisabled,
          pressed && !disabled && !loading && styles.btnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <View style={styles.inner}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.label}>{label}</Text>
            </>
          ) : (
            <>
              {iconName ? (
                <Icon name={iconName as never} size={22} color={colors.white} />
              ) : null}
              <Text style={styles.label}>{label}</Text>
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    minHeight: SOCIAL_PRIMARY_MIN_HEIGHT,
    borderRadius: SOCIAL_PRIMARY_RADIUS,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPressed: {
    opacity: 0.92,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.white,
  },
});

export default SocialPrimaryButton;
