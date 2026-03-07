/**
 * Custom tab bar – kun de 5 ikoner og labels, ingen duplikat tekst
 */

import React from 'react';
import {View, TouchableOpacity, Image, Text, StyleSheet} from 'react-native';
import {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from '@/theme/colors';

const tabIcons: Record<string, any> = {
  Home: require('@/assets/images/tab-home.png'),
  Friends: require('@/assets/images/tab-online.png'),
  CheckIn: require('@/assets/images/tab-checkin.png'),
  Messages: require('@/assets/images/tab-messages.png'),
  Profile: require('@/assets/images/tab-profile.png'),
};

const tabLabels: Record<string, string> = {
  Home: 'Hjem',
  Friends: 'Online',
  CheckIn: 'Tjek ind',
  Messages: 'Beskeder',
  Profile: 'Profil',
};

const CustomTabBar: React.FC<BottomTabBarProps> = ({state, descriptors, navigation}) => {
  const insets = useSafeAreaInsets();
  const iconSize = 32;

  return (
    <View style={[styles.wrapper, {paddingBottom: Math.max(insets.bottom, 8)}]}>
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

          const source = tabIcons[route.name];
          const label = tabLabels[route.name] || options.title || route.name;

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
                {source && (
                  <Image
                    source={source}
                    style={[
                      styles.icon,
                      {width: iconSize, height: iconSize, opacity: isFocused ? 1 : 0.55},
                    ]}
                    resizeMode="contain"
                  />
                )}
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  container: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 4,
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
  icon: {
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default CustomTabBar;
