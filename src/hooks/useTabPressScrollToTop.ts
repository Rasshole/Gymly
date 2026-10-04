/**
 * Scroll primary list to top on main-tab re-press.
 * Mirrors @react-navigation/native useScrollToTop, with optional `enabled`
 * so sibling scenes that share a tab route (Friends sub-tabs) do not all scroll.
 */
import {
  EventArg,
  NavigationContext,
  NavigationProp,
  ParamListBase,
  useRoute,
} from '@react-navigation/core';
import * as React from 'react';
import type {ScrollView} from 'react-native';

type ScrollOptions = {x?: number; y?: number; animated?: boolean};

type ScrollableView =
  | {scrollToTop(): void}
  | {scrollTo(options: ScrollOptions): void}
  | {scrollToOffset(options: {offset?: number; animated?: boolean}): void}
  | {scrollResponderScrollTo(options: ScrollOptions): void};

type ScrollableWrapper =
  | {getScrollResponder(): React.ReactNode | ScrollView}
  | {getNode(): ScrollableView}
  | ScrollableView;

function getScrollableNode(ref: React.RefObject<ScrollableWrapper | null>) {
  if (ref.current == null) {
    return null;
  }

  if (
    'scrollToTop' in ref.current ||
    'scrollTo' in ref.current ||
    'scrollToOffset' in ref.current ||
    'scrollResponderScrollTo' in ref.current
  ) {
    return ref.current;
  }
  if ('getScrollResponder' in ref.current) {
    return ref.current.getScrollResponder();
  }
  if ('getNode' in ref.current) {
    return ref.current.getNode();
  }
  return ref.current;
}

export type UseTabPressScrollToTopOptions = {
  /** When false, ignore tabPress (e.g. hidden Friends sub-tab). Default true. */
  enabled?: boolean;
};

export function useTabPressScrollToTop(
  ref: React.RefObject<ScrollableWrapper | null>,
  options?: UseTabPressScrollToTopOptions,
) {
  const enabled = options?.enabled !== false;
  const navigation = React.useContext(NavigationContext);
  const route = useRoute();
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  if (navigation === undefined) {
    throw new Error(
      "Couldn't find a navigation object. Is your component inside NavigationContainer?",
    );
  }

  React.useEffect(() => {
    const tabNavigations: NavigationProp<ParamListBase>[] = [];
    let currentNavigation: NavigationProp<ParamListBase> | undefined =
      navigation;

    while (currentNavigation) {
      if (currentNavigation.getState().type === 'tab') {
        tabNavigations.push(currentNavigation);
      }
      currentNavigation = currentNavigation.getParent();
    }

    if (tabNavigations.length === 0) {
      return;
    }

    const unsubscribers = tabNavigations.map(tab =>
      tab.addListener(
        // Multiple tab navigator implementations; event is emitted by CustomTabBar.
        // @ts-expect-error tabPress is a bottom-tabs event
        'tabPress',
        (e: EventArg<'tabPress', true>) => {
          if (!enabledRef.current) {
            return;
          }

          const isFocused = navigation.isFocused();
          const isFirst =
            tabNavigations.includes(navigation) ||
            navigation.getState().routes[0]?.key === route.key;

          requestAnimationFrame(() => {
            if (!enabledRef.current) {
              return;
            }
            const scrollable = getScrollableNode(ref) as ScrollableWrapper | null;

            if (isFocused && isFirst && scrollable && !e.defaultPrevented) {
              if ('scrollToTop' in scrollable) {
                scrollable.scrollToTop();
              } else if ('scrollTo' in scrollable) {
                scrollable.scrollTo({y: 0, animated: true});
              } else if ('scrollToOffset' in scrollable) {
                scrollable.scrollToOffset({offset: 0, animated: true});
              } else if ('scrollResponderScrollTo' in scrollable) {
                scrollable.scrollResponderScrollTo({y: 0, animated: true});
              }
            }
          });
        },
      ),
    );

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [navigation, ref, route.key]);
}
