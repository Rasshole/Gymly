/**
 * Friends Navigator — Venner, Centre, Kort only.
 */

import React, {useCallback, useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import {useFocusEffect, useRoute} from '@react-navigation/native';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing} from '@/theme/designTokens';
import FriendsScreen from './FriendsScreen';
import CentresScreen from './CentresScreen';
import MapScreen from './MapScreen';

export type FriendsTabParamList = {
  Venner: undefined;
  Centre: undefined;
  Kort: undefined;
};

export type FriendsSubRouteName = keyof FriendsTabParamList;

const FRIENDS_TAB_NAMES: FriendsSubRouteName[] = ['Venner', 'Centre', 'Kort'];

const FRIENDS_TAB_LABEL_KEYS: Record<FriendsSubRouteName, string> = {
  Venner: 'friendsTabs.friends',
  Centre: 'friendsTabs.centres',
  Kort: 'friendsTabs.map',
};

function isKnownFriendsParam(s: string): s is FriendsSubRouteName {
  return FRIENDS_TAB_NAMES.includes(s as FriendsSubRouteName);
}

function normalizeFriendsSubRoute(screen: string | undefined): FriendsSubRouteName {
  if (!screen || !isKnownFriendsParam(screen)) {
    return 'Venner';
  }
  return screen;
}

const FriendsNavigator = () => {
  const route = useRoute();
  const {t} = useTranslation();
  const tabs = FRIENDS_TAB_NAMES.map(name => ({
    name,
    label: t(FRIENDS_TAB_LABEL_KEYS[name]),
  }));
  const [active, setActive] = useState<FriendsSubRouteName>('Venner');
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;

  const syncFromParams = useCallback(() => {
    const screen = (route.params as {screen?: string} | undefined)?.screen;
    setActive(normalizeFriendsSubRoute(screen));
  }, [route.params]);

  useEffect(() => {
    syncFromParams();
  }, [syncFromParams]);

  useFocusEffect(
    useCallback(() => {
      syncFromParams();
    }, [syncFromParams]),
  );

  const activeIndex = tabs.findIndex(tab => tab.name === active);

  useEffect(() => {
    if (tabBarWidth <= 0 || tabs.length === 0) {
      return;
    }
    const segment = tabBarWidth / tabs.length;
    const idx = activeIndex >= 0 ? activeIndex : 0;
    Animated.spring(indicatorX, {
      toValue: idx * segment,
      useNativeDriver: true,
      friction: 9,
      tension: 68,
    }).start();
  }, [activeIndex, indicatorX, tabBarWidth, tabs.length]);

  const onTabRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTabBarWidth(w);
    const idx = tabs.findIndex(tab => tab.name === active);
    if (w > 0 && tabs.length > 0) {
      indicatorX.setValue(Math.max(0, idx) * (w / tabs.length));
    }
  };

  const renderScene = () => {
    switch (active) {
      case 'Venner':
        return <FriendsScreen />;
      case 'Centre':
        return <CentresScreen />;
      case 'Kort':
        return <MapScreen />;
      default:
        return <FriendsScreen />;
    }
  };

  const segmentW = tabBarWidth > 0 && tabs.length > 0 ? tabBarWidth / tabs.length : 0;

  return (
    <View style={styles.container}>
      <View style={styles.tabBarOuter}>
        <View style={styles.tabRow} onLayout={onTabRowLayout}>
          {tabs.map(tab => {
            const isFocused = active === tab.name;
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="button"
                accessibilityState={isFocused ? {selected: true} : {}}
                accessibilityLabel={tab.label}
                onPress={() => setActive(tab.name)}
                style={styles.tabItem}>
                <Text
                  style={[
                    styles.tabLabel,
                    !isFocused && styles.tabLabelInactive,
                    isFocused && styles.tabLabelActive,
                  ]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
          {segmentW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabIndicator,
                {
                  width: segmentW,
                  transform: [{translateX: indicatorX}],
                },
              ]}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.scene}>{renderScene()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  tabBarOuter: {
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: 6,
    paddingHorizontal: spacing.lg,
  },
  tabRow: {
    flexDirection: 'row',
    position: 'relative',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: -0.15,
  },
  tabLabelInactive: {
    opacity: 0.5,
  },
  tabLabelActive: {
    color: colors.primaryDark,
    opacity: 1,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  scene: {
    flex: 1,
  },
});

export default FriendsNavigator;
