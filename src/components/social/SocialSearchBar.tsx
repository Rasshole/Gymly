import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {shadows} from '@/theme/designTokens';
import {
  SOCIAL_SEARCH_HEIGHT,
  SOCIAL_SEARCH_RADIUS,
  SOCIAL_SEARCH_BG,
  SOCIAL_INPUT_PADDING_H,
  SOCIAL_ICON_SLOT,
} from './socialUiTokens';

export type SocialSearchBarProps = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  /** Extra wrapper style (margins, absolute position, etc.) */
  style?: StyleProp<ViewStyle>;
  /** Search field variant */
  variant?: 'inline' | 'floating' | 'map';
} & Pick<TextInputProps, 'autoCorrect' | 'autoCapitalize' | 'keyboardType'>;

const SocialSearchBar: React.FC<SocialSearchBarProps> = ({
  value,
  onChangeText,
  placeholder,
  style,
  variant = 'inline',
  autoCorrect = true,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
}) => {
  const [focused, setFocused] = useState(false);
  const floating = variant === 'floating' || variant === 'map';
  const isMap = variant === 'map';
  const focusAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [focused, focusAnim]);

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.6)', colors.primary + '66'],
  });

  const shadowOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.22],
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        floating && styles.wrapFloating,
        isMap && styles.wrapMap,
        focused && !isMap && styles.wrapFocusedBorder,
        focused &&
          !isMap &&
          (floating ? styles.wrapFocusedBgFloating : styles.wrapFocusedBgInline),
        isMap && {
          borderColor,
          ...Platform.select({
            ios: {shadowOpacity},
          }),
        },
        style,
      ]}>
      <View style={styles.iconSlot}>
        <Icon
          name="search"
          size={isMap ? 19 : 20}
          color={focused ? colors.primary : colors.textMuted}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        selectionColor={colors.primary}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          style={styles.clear}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityLabel="Ryd søgning">
          <Icon name="close-circle" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SOCIAL_SEARCH_HEIGHT,
    borderRadius: SOCIAL_SEARCH_RADIUS,
    backgroundColor: SOCIAL_SEARCH_BG,
    paddingRight: SOCIAL_INPUT_PADDING_H - 2,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
    }),
  },
  wrapFloating: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  wrapMap: {
    height: 50,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  wrapFocusedBorder: {
    borderColor: colors.primary + '55',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {elevation: 3},
    }),
  },
  wrapFocusedBgFloating: {
    backgroundColor: colors.white,
  },
  wrapFocusedBgInline: {
    backgroundColor: colors.white,
  },
  iconSlot: {
    width: SOCIAL_ICON_SLOT,
    height: SOCIAL_SEARCH_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    paddingRight: 8,
    minHeight: SOCIAL_SEARCH_HEIGHT - 4,
  },
  clear: {
    padding: 4,
  },
});

export default SocialSearchBar;
