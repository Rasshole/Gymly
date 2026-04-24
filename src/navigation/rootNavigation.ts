import {CommonActions} from '@react-navigation/native';

type Navish = {
  getState?: () => {routeNames?: string[]};
  getParent?: () => Navish | undefined;
  navigate?: (name: string, params: object) => void;
  dispatch?: (action: ReturnType<typeof CommonActions.navigate>) => void;
};

/**
 * Skærme som FriendProfile ligger på root Stack ved siden af MainTabs.
 * Under Tab → custom navigator skal man gå op i hierarkiet eller dispatch’e.
 */
export function navigateToRootScreen(
  navigation: Navish,
  screen: string,
  params: object,
): void {
  let nav: Navish | undefined = navigation;
  for (let i = 0; i < 10; i++) {
    if (!nav) {
      break;
    }
    const names = nav.getState?.()?.routeNames;
    if (Array.isArray(names) && names.includes(screen) && nav.navigate) {
      nav.navigate(screen, params);
      return;
    }
    nav = nav.getParent?.();
  }

  if (typeof navigation.dispatch === 'function') {
    navigation.dispatch(
      CommonActions.navigate({
        name: screen,
        params,
        merge: true,
      }),
    );
    return;
  }

  navigation.navigate?.(screen, params);
}

export function navigateToFriendProfile(
  navigation: Navish,
  params: {
    friendId: string;
    friendName?: string;
    mutualFriends?: number;
    gyms?: string[];
    friendAvatarUrl?: string;
  },
): void {
  navigateToRootScreen(navigation, 'FriendProfile', params);
}
