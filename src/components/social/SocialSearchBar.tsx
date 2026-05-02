import React, {useState} from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
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
  variant?: 'inline' | 'floating';
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
  const floating = variant === 'floating';

  return (
    <View
      style={[
        styles.wrap,
        floating && styles.wrapFloating,
        focused && styles.wrapFocusedBorder,
        focused &&
          (floating
            ? styles.wrapFocusedBgFloating
            : styles.wrapFocusedBgInline),
        style,
      ]}>
      <View style={styles.iconSlot}>
        <Icon
          name="search"
          size={20}
          color={colors.textMuted}
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
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: SOCIAL_SEARCH_HEIGHT,
    borderRadius: SOCIAL_SEARCH_RADIUS,
    backgroundColor: SOCIAL_SEARCH_BG,
    paddingRight: SOCIAL_INPUT_PADDING_H - 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'transparent',
  },
  wrapFloating: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  wrapFocusedBorder: {
    borderColor: colors.primary + '55',
  },
  wrapFocusedBgFloating: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
  },
  wrapFocusedBgInline: {
    backgroundColor: '#FAFAFC',
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
    paddingVertical: 0,
    paddingRight: 8,
    minHeight: SOCIAL_SEARCH_HEIGHT - 4,
  },
  clear: {
    padding: 4,
  },
});

export default SocialSearchBar;
