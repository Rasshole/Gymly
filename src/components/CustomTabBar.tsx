/**
 * Custom tab bar – faner med ikoner og labels
 * Rapporterer faktisk højde til navigatoren så useBottomTabBarHeight() er korrekt.
 */

import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  BottomTabBarProps,
  BottomTabBarHeightCallbackContext,
} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import {spacing, radius} from '@/theme/designTokens';
import {useChatStore} from '@/store/chatStore';
import NotificationBadge from '@/components/ui/Badge';

/** Samme stil for alle faner: Ionicons outline ↔ filled, Gymly primary når aktiv */
const TAB_ICONS: Record<string, {focused: string; blur: string}> = {
  Home: {focused: 'home', blur: 'home-outline'},
  Friends: {focused: 'people', blur: 'people-outline'},
  CheckIn: {focused: 'barbell', blur: 'barbell-outline'},
  Badges: {focused: 'ribbon', blur: 'ribbon-outline'},
  Messages: {focused: 'chatbubbles', blur: 'chatbubbles-outline'},
  Profile: {focused: 'person', blur: 'person-outline'},
};

const tabLabels: Record<string, string> = {
  Home: 'Hjem',
  Friends: 'Venner',
  CheckIn: 'Tjek ind',
  Badges: 'Badges',
  Messages: 'Beskeder',
  Profile: 'Profil',
};

const CustomTabBar: React.FC<BottomTabBarProps> = ({state, descriptors, navigation}) => {
  const insets = useSafeAreaInsets();
  const onTabBarHeight = React.useContext(BottomTabBarHeightCallbackContext);
  const iconSize = 32;

  const onLayout = (e: LayoutChangeEvent) => {
    onTabBarHeight?.(e.nativeEvent.layout.height);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrapper, {paddingBottom: Math.max(insets.bottom, spacing.sm)}]}>
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const {options} = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const label = tabLabels[route.name] || options.title || route.name;
          const ionPair = TAB_ICONS[route.name];
          const iconName = ionPair
            ? isFocused
              ? ionPair.focused
              : ionPair.blur
            : 'ellipse-outline';
          const iconColor = isFocused ? colors.primary : colors.textMuted;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? {selected: true} : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || options.title}
              onPress={onPress}
              style={styles.tab}
              activeOpacity={0.7}>
              <View style={styles.tabContent}>
                <View style={route.name === 'Messages' ? styles.iconWithBadge : undefined}>
                  <Icon
                    name={iconName as React.ComponentProps<typeof Icon>['name']}
                    size={iconSize}
                    color={iconColor}
                    style={styles.tabIcon}
                  />
                  {route.name === 'Messages' && messagesUnread > 0 ? (
                    <View style={styles.messageBadgeWrap}>
                      <NotificationBadge count={messagesUnread} variant="error" maxCount={99} />
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.label, {color: isFocused ? colors.primary : colors.textMuted}]}
                  numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  container: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWithBadge: {
    position: 'relative',
  },
  messageBadgeWrap: {
    position: 'absolute',
    top: -6,
    right: -10,
  },
  tabIcon: {
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    color: colors.text,
  },
});

export default CustomTabBar;
