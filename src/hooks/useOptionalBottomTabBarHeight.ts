/**
 * Optional bottom-tab bar height — safe on stack screens outside the tab navigator.
 * Prefer real tab height when present; otherwise fall back to safe-area bottom inset.
 */
import {useContext} from 'react';
import {BottomTabBarHeightContext} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

/** Pure resolver — unit-tested without a React renderer. */
export function resolveOptionalBottomTabBarHeight(
  tabHeight: number | undefined | null,
  safeAreaBottom: number,
  fallbackExtra = 0,
): number {
  if (typeof tabHeight === 'number' && Number.isFinite(tabHeight)) {
    return tabHeight;
  }
  return Math.max(safeAreaBottom, 0) + fallbackExtra;
}

export function useOptionalBottomTabBarHeight(fallbackExtra = 0): number {
  const tabHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  return resolveOptionalBottomTabBarHeight(
    tabHeight,
    insets.bottom,
    fallbackExtra,
  );
}
