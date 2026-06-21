import {useEffect, useRef} from 'react';
import {Animated} from 'react-native';

/** Subtle fade + slide-up on mount — staggered by index. */
export function useStaggeredFadeIn(index: number, baseDelayMs = 60) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const delay = index * baseDelayMs;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [index, baseDelayMs, opacity, translateY]);

  return {opacity, translateY};
}
