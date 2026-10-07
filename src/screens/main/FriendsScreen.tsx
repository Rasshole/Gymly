/**
 * Friends Screen — unified people search + friends list.
 */

import React, {useState, useCallback, useEffect, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
  type TextInput,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useTabPressScrollToTop} from '@/hooks/useTabPressScrollToTop';
import {useDmInboxUnreadSync} from '@/hooks/useDmInboxUnreadSync';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useBlockStore} from '@/store/blockStore';
import {usePendingFriendRequestStore} from '@/store/pendingFriendRequestStore';
import {useNotificationStore} from '@/store/notificationStore';
import {useInAppNotificationStore} from '@/store/inAppNotificationStore';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import ManualInviteCodeCard from '@/components/referral/ManualInviteCodeCard';
import {startContactInvite} from '@/services/referral/startContactInvite';
import {isInviteFiveFriendsSurfaceEnabled} from '@/services/referral/inviteSurface';
import {
  listFriendsWithProfiles,
  upsertMyProfile,
  searchProfiles,
  sendFriendRequest,
  acceptFriendRequest,
  listPendingIncomingRequests,
  getOutgoingPendingToMany,
  type PublicProfile,
} from '@/services/supabase/friendService';
import {
  followProfile,
  listMyFollowedIds,
  unfollowProfile,
} from '@/services/supabase/profileFollowService';
import {isFriendActionUnavailableError} from '@/services/supabase/userBlockService';
import {
  bumpSearchGeneration,
  excludeBlockedIds,
  shouldCommitSearchResults,
} from '@/utils/userBlockFilter';
import {
  FRIEND_SEARCH_MIN_CHARS,
  planFriendSearch,
  shouldClearResultsOnSearchError,
} from '@/utils/friendSearchPlan';
import Avatar from '@/components/ui/Avatar';
import {
  PRESENCE_WINDOW_HOURS,
  fetchLatestCheckInPerUser,
  type CheckInRow,
} from '@/services/supabase/presenceService';
import {navigateToFriendProfile} from '@/navigation/rootNavigation';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {EditProfileCentersSheet} from '@/components/profile/EditProfileCentersSheet';
import {fetchUserHomeGymIds, syncUserHomeGymsAfterSave} from '@/services/supabase/homeGymsService';
import {subscribeProfileCenters} from '@/realtime/profileCentersBridge';
import {
  fetchMyPrimaryGymDiscoverable,
  listPrimaryGymSuggestions,
  setMyPrimaryGymDiscoverable,
} from '@/services/supabase/primaryGymSuggestionsService';
import {
  gymSuggestPhase,
  mergeGymSuggestionRows,
  shouldCommitGymSuggestions,
} from '@/utils/primaryGymSuggestions';
import {isDemoContentMode} from '@/demo/demoContentGate';
import {buildDemoFriendsScreenList} from '@/demo/demoFriendsList';
import {useTranslation} from '@/i18n';
import {formatRelativeTime} from '@/utils/formatRelativeTime';
import {isFocusRefreshStale, markFocusRefreshed} from '@/utils/focusRefreshThrottle';

function isDuplicatePendingRequest(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    if ((error as {code?: string}).code === '23505') {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : '';
  return message.includes('allerede en afventende anmodning');
}

function friendActionErrorText(error: unknown, fallback: string): string {
  if (isFriendActionUnavailableError(error)) {
    return fallback;
  }
  const message = error instanceof Error ? error.message.trim() : '';
  if (
    !message ||
    /row-level security|permission denied|JWT|PGRST|duplicate key/i.test(message)
  ) {
    return fallback;
  }
  return message;
}

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_CHARS = FRIEND_SEARCH_MIN_CHARS;
/** Matches Avatar size "md" (40px) so the online dot sits on the circle. */
const AVATAR_SIZE = 40;

type FriendshipStatus = 'friend' | 'pending_sent' | 'pending_received' | 'none';

type Friend = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  isOnline: boolean;
  gymName?: string;
  checkInTime?: Date;
};

type PeopleRow = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  isFriend: boolean;
  isOnline: boolean;
  gymName?: string;
  checkInTime?: Date;
  status: FriendshipStatus;
  incomingRequestId?: string;
};

function mapProfilesToFriends(
  profiles: PublicProfile[],
  latestByUser: Map<string, CheckInRow>,
): Friend[] {
  const windowMs = PRESENCE_WINDOW_HOURS * 3600_000;
  const now = Date.now();
  return profiles.map(p => {
    const row = latestByUser.get(p.id);
    const checkInTime = row ? new Date(row.created_at) : undefined;
    const isOnline = Boolean(
      checkInTime && now - checkInTime.getTime() <= windowMs,
    );
    return {
      id: p.id,
      name: p.displayName,
      username: p.username || undefined,
      avatar: p.avatarUrl ?? undefined,
      isOnline,
      gymName: isOnline ? row?.gym_name : undefined,
      checkInTime,
    };
  });
}

function matchScore(query: string, name: string, username?: string): number {
  const q = query.trim().toLowerCase();
  if (!q) {
    return 0;
  }
  const n = name.toLowerCase();
  const u = (username ?? '').toLowerCase();
  if (n === q || u === q) {
    return 300;
  }
  if (n.startsWith(q) || u.startsWith(q)) {
    return 200;
  }
  if (n.includes(q) || u.includes(q)) {
    return 100;
  }
  return 0;
}

type FriendsScreenProps = {
  /** When false, ignore main-tab re-press (hidden Friends sub-tab). */
  isActive?: boolean;
  /** Home increments this so the existing search field opens focused. */
  focusSearchToken?: number;
};

const FriendsScreen = ({
  isActive = true,
  focusSearchToken,
}: FriendsScreenProps) => {
  const navigation = useNavigation<any>();
  const {t, tp, language} = useTranslation();
  const user = useAppStore(s => s.user);
  useDmInboxUnreadSync();
  const loadFriendStore = useFriendStore(s => s.load);
  const blockedIds = useBlockStore(s => s.blockedIds);
  const blockedVersion = useBlockStore(s => s.version);
  const loadBlocked = useBlockStore(s => s.load);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [searchResults, setSearchResults] = useState<PeopleRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [incomingByFromId, setIncomingByFromId] = useState<
    Map<string, string>
  >(() => new Map());
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const actionLocksRef = useRef<Set<string>>(new Set());
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const followLocksRef = useRef<Set<string>>(new Set());
  const searchInputRef = useRef<TextInput>(null);
  const [suggestions, setSuggestions] = useState<PeopleRow[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  const [centerKnown, setCenterKnown] = useState(false);
  const [primaryCenterId, setPrimaryCenterId] = useState<string | null>(null);
  const [homeGymIds, setHomeGymIds] = useState<string[]>([]);
  const [discoverableAtGym, setDiscoverableAtGym] = useState(false);
  const [discoverableKnown, setDiscoverableKnown] = useState(false);
  const [centersSheetOpen, setCentersSheetOpen] = useState(false);
  const [optInBusy, setOptInBusy] = useState(false);
  const suggestGenRef = useRef(0);
  const primaryCenterRef = useRef<string | null>(null);
  const friendsFetchGenRef = useRef(0);
  const searchGenRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStartedSearchQueryRef = useRef<string | null>(null);
  const alphabeticalFriendsRef = useRef<Friend[]>([]);
  const friendIdSetRef = useRef<Set<string>>(new Set());
  const incomingByFromIdRef = useRef<Map<string, string>>(new Map());
  const listRef = useRef<FlatList>(null);
  useTabPressScrollToTop(listRef, {enabled: isActive});
  const userId = user?.id;

  const openFriendRequestsSheet = usePendingFriendRequestStore(s => s.openSheet);
  const loadPendingRequests = usePendingFriendRequestStore(s => s.load);
  const pendingFriendRequests = useNotificationStore(
    s => s.incomingFriendRequestCount,
  );

  const stackNavigate = useCallback(
    (routeName: string) => {
      const stackNav = navigation.getParent()?.getParent?.();
      if (stackNav && typeof (stackNav as any).navigate === 'function') {
        (stackNav as any).navigate(routeName);
        return;
      }
      (navigation as any).navigate?.(routeName);
    },
    [navigation],
  );

  const openInviteFiveFriends = useCallback(() => {
    if (!isInviteFiveFriendsSurfaceEnabled()) {
      return;
    }
    stackNavigate('InviteFiveFriends');
  }, [stackNavigate]);

  const contactInviteBusy = useRef(false);
  const openContactInvite = useCallback(() => {
    if (!isInviteFiveFriendsSurfaceEnabled() || contactInviteBusy.current) {
      return;
    }
    contactInviteBusy.current = true;
    void startContactInvite(t).finally(() => {
      contactInviteBusy.current = false;
    });
  }, [t]);

  const openPersonProfile = useCallback(
    (item: {id: string; name: string; avatar?: string; gymName?: string}) => {
      navigateToFriendProfile(navigation, {
        friendId: item.id,
        friendName: item.name,
        mutualFriends: 0,
        gyms: item.gymName ? [item.gymName] : [],
        friendAvatarUrl: item.avatar,
      });
    },
    [navigation],
  );

  const loadGymSuggestions = useCallback(async () => {
    if (!userId) {
      setSuggestions([]);
      setCenterKnown(false);
      setPrimaryCenterId(null);
      primaryCenterRef.current = null;
      return;
    }
    const gen = ++suggestGenRef.current;
    setSuggestLoading(true);
    setSuggestError(false);
    try {
      const ids = await fetchUserHomeGymIds(userId, useAppStore.getState().user?.favoriteGyms);
      if (gen !== suggestGenRef.current) {
        return;
      }
      const centerId = ids[0] ?? null;
      if (primaryCenterRef.current !== centerId) {
        setSuggestions([]);
      }
      primaryCenterRef.current = centerId;
      setHomeGymIds(ids);
      setPrimaryCenterId(centerId);
      setCenterKnown(true);
      const visible = await fetchMyPrimaryGymDiscoverable();
      if (gen !== suggestGenRef.current) {
        return;
      }
      setDiscoverableAtGym(visible);
      setDiscoverableKnown(true);
      if (!centerId) {
        setSuggestions([]);
        return;
      }
      const profiles = await listPrimaryGymSuggestions(centerId);
      if (
        !shouldCommitGymSuggestions(
          gen,
          centerId,
          suggestGenRef.current,
          primaryCenterRef.current,
        )
      ) {
        return;
      }
      const pendingOut = await getOutgoingPendingToMany(
        userId,
        profiles.map(p => p.id),
      );
      if (
        !shouldCommitGymSuggestions(
          gen,
          centerId,
          suggestGenRef.current,
          primaryCenterRef.current,
        )
      ) {
        return;
      }
      let incoming = incomingByFromIdRef.current;
      try {
        const incomingRows = await listPendingIncomingRequests(userId);
        if (
          !shouldCommitGymSuggestions(
            gen,
            centerId,
            suggestGenRef.current,
            primaryCenterRef.current,
          )
        ) {
          return;
        }
        incoming = new Map(incomingRows.map(req => [req.fromUserId, req.id]));
      } catch {
        incoming = incomingByFromIdRef.current;
      }
      const blocked = useBlockStore.getState().blockedIds;
      const friendsNow = friendIdSetRef.current;
      const rows: PeopleRow[] = [];
      for (const profile of profiles) {
        if (
          profile.id === userId ||
          blocked.has(profile.id) ||
          friendsNow.has(profile.id)
        ) {
          continue;
        }
        let status: FriendshipStatus = 'none';
        let incomingRequestId: string | undefined;
        if (incoming.has(profile.id)) {
          status = 'pending_received';
          incomingRequestId = incoming.get(profile.id);
        } else if (pendingOut.has(profile.id)) {
          status = 'pending_sent';
        }
        rows.push({
          id: profile.id,
          name: profile.displayName || profile.username,
          username: profile.username || undefined,
          avatar: profile.avatarUrl ?? undefined,
          isFriend: false,
          isOnline: false,
          status,
          incomingRequestId,
        });
      }
      setSuggestions(rows);
    } catch {
      if (gen === suggestGenRef.current) {
        setSuggestError(true);
      }
    } finally {
      if (gen === suggestGenRef.current) {
        setSuggestLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void loadGymSuggestions();
    return subscribeProfileCenters(userId, () => {
      void loadGymSuggestions();
    });
  }, [userId, loadGymSuggestions]);

  const enableGymDiscoverable = useCallback(async () => {
    if (optInBusy) {
      return;
    }
    setOptInBusy(true);
    try {
      await setMyPrimaryGymDiscoverable(true);
      setDiscoverableAtGym(true);
    } catch {
      Alert.alert(t('friendsScreen.gymMatesOptIn'), t('friendsScreen.gymMatesError'), [
        {text: t('common.cancel'), style: 'cancel'},
        {text: t('friendsScreen.gymMatesRetry'), onPress: () => void enableGymDiscoverable()},
      ]);
    } finally {
      setOptInBusy(false);
    }
  }, [optInBusy, t]);

  const saveHomeGyms = useCallback(
    async (orderedIds: string[]) => {
      if (!userId) {
        throw new Error('no user');
      }
      await syncUserHomeGymsAfterSave(userId, orderedIds, {skipProfileSync: true});
      setCentersSheetOpen(false);
    },
    [userId],
  );

  const refreshIncoming = useCallback(async (uid: string) => {
    try {
      const incoming = await listPendingIncomingRequests(uid);
      const map = new Map<string, string>();
      for (const req of incoming) {
        map.set(req.fromUserId, req.id);
      }
      setIncomingByFromId(map);
    } catch {
      setIncomingByFromId(new Map());
    }
  }, []);

  const refreshFriends = useCallback(
    async (opts?: {force?: boolean}) => {
      if (!userId) {
        setFriends([]);
        setLoadingFriends(false);
        return;
      }

      const fetchGen = ++friendsFetchGenRef.current;
      const cachedStore = useFriendStore.getState();
      if (cachedStore.lastLoadedUserId === userId && cachedStore.friends.length > 0) {
        // Keep existing rows (incl. check-in times) while refreshing; bootstrap names only once.
        setFriends(prev =>
          prev.length > 0
            ? prev
            : mapProfilesToFriends(cachedStore.friends, new Map()),
        );
        setLoadingFriends(false);
      } else {
        setLoadingFriends(true);
      }

      try {
        const currentUser = useAppStore.getState().user;
        if (currentUser) {
          void upsertMyProfile(currentUser).catch(() => {});
        }
        void loadFriendStore(userId);
        void refreshIncoming(userId);

        const friendsKey = `friends:list:${userId}`;
        const skipProfileNetwork =
          !opts?.force &&
          !isFocusRefreshStale(friendsKey, 45_000) &&
          useFriendStore.getState().lastLoadedUserId === userId &&
          useFriendStore.getState().friends.length > 0;

        if (isDemoContentMode()) {
          if (fetchGen !== friendsFetchGenRef.current) {
            return;
          }
          setFriends(buildDemoFriendsScreenList(userId) as Friend[]);
          return;
        }

        const profiles = skipProfileNetwork
          ? useFriendStore.getState().friends
          : await listFriendsWithProfiles(userId);
        if (fetchGen !== friendsFetchGenRef.current) {
          return;
        }

        const friendIds = profiles.map(p => p.id);
        let latestByUser = new Map<string, CheckInRow>();
        try {
          latestByUser = await fetchLatestCheckInPerUser(friendIds);
        } catch {
          latestByUser = new Map();
        }
        if (fetchGen !== friendsFetchGenRef.current) {
          return;
        }

        setFriends(mapProfilesToFriends(profiles, latestByUser));
        if (!skipProfileNetwork) {
          markFocusRefreshed(`friends:list:${userId}`);
        }
      } catch {
        if (fetchGen === friendsFetchGenRef.current) {
          setFriends([]);
        }
      } finally {
        if (fetchGen === friendsFetchGenRef.current) {
          setLoadingFriends(false);
        }
      }
    },
    [userId, loadFriendStore, refreshIncoming],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshFriends();
      if (userId) {
        void loadBlocked(userId);
      }
    }, [refreshFriends, userId, loadBlocked]),
  );

  // After block: strip loaded rows and invalidate in-flight search so stale hits cannot reappear.
  useEffect(() => {
    if (blockedVersion === 0) {
      return;
    }
    searchGenRef.current = bumpSearchGeneration(searchGenRef.current);
    setSearchLoading(false);
    setSearchResults(prev => excludeBlockedIds(prev, blockedIds));
    setFriends(prev => excludeBlockedIds(prev, blockedIds));
    setSuggestions(prev => excludeBlockedIds(prev, blockedIds));
    setIncomingByFromId(prev => {
      if (blockedIds.size === 0) {
        return prev;
      }
      const next = new Map(prev);
      for (const id of blockedIds) {
        next.delete(id);
      }
      return next;
    });
  }, [blockedVersion, blockedIds]);

  const alphabeticalFriends = useMemo(
    () =>
      excludeBlockedIds(
        [...friends].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}),
        ),
        blockedIds,
      ),
    [friends, blockedIds],
  );

  const friendIdSet = useMemo(
    () => new Set(friends.map(f => f.id)),
    [friends],
  );

  alphabeticalFriendsRef.current = alphabeticalFriends;
  friendIdSetRef.current = friendIdSet;
  incomingByFromIdRef.current = incomingByFromId;

  useEffect(() => {
    const hidden = new Set<string>(blockedIds);
    for (const id of friendIdSet) {
      hidden.add(id);
    }
    setSuggestions(prev => mergeGymSuggestionRows(prev, incomingByFromId, hidden));
  }, [incomingByFromId, blockedIds, friendIdSet]);

  const isSearching = searchQuery.trim().length >= MIN_SEARCH_CHARS;

  const runRemoteSearch = useCallback(async (rawQuery: string) => {
    if (!userId) {
      return;
    }
    const q = rawQuery.trim();
    if (q.length < MIN_SEARCH_CHARS) {
      lastStartedSearchQueryRef.current = null;
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const gen = ++searchGenRef.current;
    lastStartedSearchQueryRef.current = q;
    // Keep prior rows visible while refreshing the same / new query.
    setSearchLoading(true);
    setSearchError(null);

    try {
      const friendsSnapshot = alphabeticalFriendsRef.current;
      const friendIdsSnapshot = friendIdSetRef.current;
      const [remote] = await Promise.all([searchProfiles(userId, q)]);
      if (!shouldCommitSearchResults(gen, searchGenRef.current)) {
        return;
      }

      const liveBlocked = useBlockStore.getState().blockedIds;

      const friendHits: PeopleRow[] = friendsSnapshot
        .filter(f => !liveBlocked.has(f.id))
        .filter(f => matchScore(q, f.name, f.username) > 0)
        .map(f => ({
          id: f.id,
          name: f.name,
          username: f.username,
          avatar: f.avatar,
          isFriend: true,
          isOnline: f.isOnline,
          gymName: f.gymName,
          checkInTime: f.checkInTime,
          status: 'friend' as const,
        }));

      const remoteVisible = excludeBlockedIds(remote, liveBlocked);
      const remoteIds = remoteVisible.map(p => p.id);
      const pendingOut = await getOutgoingPendingToMany(userId, remoteIds);
      if (!shouldCommitSearchResults(gen, searchGenRef.current)) {
        return;
      }

      let incomingMap = incomingByFromIdRef.current;
      try {
        const incoming = await listPendingIncomingRequests(userId);
        if (!shouldCommitSearchResults(gen, searchGenRef.current)) {
          return;
        }
        incomingMap = new Map(
          incoming
            .filter(r => !liveBlocked.has(r.fromUserId))
            .map(r => [r.fromUserId, r.id]),
        );
        setIncomingByFromId(incomingMap);
      } catch {
        /* keep existing */
      }

      const seen = new Set(friendHits.map(r => r.id));
      const otherHits: PeopleRow[] = [];
      for (const p of remoteVisible) {
        if (p.id === userId || seen.has(p.id) || liveBlocked.has(p.id)) {
          continue;
        }
        seen.add(p.id);
        const isFriend = friendIdsSnapshot.has(p.id);
        let status: FriendshipStatus = 'none';
        let incomingRequestId: string | undefined;
        if (isFriend) {
          status = 'friend';
        } else if (incomingMap.has(p.id)) {
          status = 'pending_received';
          incomingRequestId = incomingMap.get(p.id);
        } else if (pendingOut.has(p.id)) {
          status = 'pending_sent';
        }
        otherHits.push({
          id: p.id,
          name: p.displayName,
          username: p.username || undefined,
          avatar: p.avatarUrl ?? undefined,
          isFriend,
          isOnline: false,
          status,
          incomingRequestId,
        });
      }

      const rank = (row: PeopleRow) => {
        const score = matchScore(q, row.name, row.username);
        const friendBoost = row.isFriend ? 1000 : 0;
        return friendBoost + score;
      };

      const merged = [...friendHits, ...otherHits].sort((a, b) => {
        const diff = rank(b) - rank(a);
        if (diff !== 0) {
          return diff;
        }
        return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
      });

      const blockedNow = useBlockStore.getState().blockedIds;
      if (!shouldCommitSearchResults(gen, searchGenRef.current)) {
        return;
      }
      setSearchResults(excludeBlockedIds(merged, blockedNow));
    } catch {
      if (shouldCommitSearchResults(gen, searchGenRef.current)) {
        setSearchError(t('friendsScreen.searchError'));
        if (shouldClearResultsOnSearchError()) {
          setSearchResults([]);
        }
      }
    } finally {
      if (shouldCommitSearchResults(gen, searchGenRef.current)) {
        setSearchLoading(false);
      }
    }
  }, [userId, t]);

  const runRemoteSearchRef = useRef(runRemoteSearch);
  runRemoteSearchRef.current = runRemoteSearch;

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }

    const q = searchQuery.trim();
    const plan = planFriendSearch(
      q,
      lastStartedSearchQueryRef.current,
      MIN_SEARCH_CHARS,
    );

    if (plan.action === 'clear') {
      searchGenRef.current = bumpSearchGeneration(searchGenRef.current);
      lastStartedSearchQueryRef.current = null;
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    if (plan.action === 'noop') {
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      const latest = planFriendSearch(
        searchQuery.trim(),
        lastStartedSearchQueryRef.current,
        MIN_SEARCH_CHARS,
      );
      if (latest.action !== 'schedule') {
        return;
      }
      void runRemoteSearchRef.current(latest.query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [searchQuery]);

  // Invalidate in-flight search when leaving the screen so late replies cannot land.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (searchTimerRef.current) {
          clearTimeout(searchTimerRef.current);
          searchTimerRef.current = null;
        }
        searchGenRef.current = bumpSearchGeneration(searchGenRef.current);
        setSearchLoading(false);
      };
    }, []),
  );
  useEffect(() => {
    if (!focusSearchToken || !isActive) {
      return;
    }
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [focusSearchToken, isActive]);

  const visiblePersonIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of searchResults) {
      ids.add(row.id);
    }
    for (const row of suggestions) {
      ids.add(row.id);
    }
    for (const row of friends) {
      ids.add(row.id);
    }
    return [...ids];
  }, [searchResults, suggestions, friends]);

  useEffect(() => {
    if (!userId || visiblePersonIds.length === 0) {
      return;
    }
    let cancelled = false;
    void listMyFollowedIds(userId, visiblePersonIds)
      .then(ids => {
        if (!cancelled) {
          setFollowedIds(ids);
        }
      })
      .catch(() => {
        /* keep the last known follow state */
      });
    return () => {
      cancelled = true;
    };
  }, [userId, visiblePersonIds]);

  const releaseActionLock = useCallback((personId: string) => {
    actionLocksRef.current.delete(personId);
    setActionBusyId(prev => (prev === personId ? null : prev));
  }, []);

  const handleSendRequest = useCallback(
    async (person: PeopleRow) => {
      if (!userId || person.id === userId) {
        return;
      }
      if (person.status === 'pending_sent' || actionLocksRef.current.has(person.id)) {
        return;
      }
      actionLocksRef.current.add(person.id);
      setActionBusyId(person.id);
      const markSent = (row: PeopleRow) =>
        row.id === person.id ? {...row, status: 'pending_sent' as const} : row;
      try {
        await sendFriendRequest(userId, person.id);
        setSearchResults(prev => prev.map(markSent));
        setSuggestions(prev => prev.map(markSent));
      } catch (e) {
        if (isDuplicatePendingRequest(e)) {
          setSearchResults(prev => prev.map(markSent));
          setSuggestions(prev => prev.map(markSent));
          return;
        }
        const msg = friendActionErrorText(e, t('friendsScreen.actionFailed'));
        Alert.alert(t('addFriend.couldNotSend'), msg, [
          {text: t('common.cancel'), style: 'cancel'},
          {
            text: t('friendsScreen.searchRetry'),
            onPress: () => void handleSendRequest(person),
          },
        ]);
      } finally {
        releaseActionLock(person.id);
      }
    },
    [userId, t, releaseActionLock],
  );

  const handleAccept = useCallback(
    async (person: PeopleRow) => {
      if (!userId || !person.incomingRequestId) {
        return;
      }
      if (actionLocksRef.current.has(person.id)) {
        return;
      }
      actionLocksRef.current.add(person.id);
      setActionBusyId(person.id);
      try {
        await acceptFriendRequest(person.incomingRequestId);
        useInAppNotificationStore
          .getState()
          .setFriendRequestOutcomeByRequestId(
            person.incomingRequestId,
            'accepted',
            person.name || '',
          );
        const markFriend = (row: PeopleRow) =>
          row.id === person.id
            ? {
                ...row,
                status: 'friend' as const,
                isFriend: true,
                incomingRequestId: undefined,
              }
            : row;
        setSearchResults(prev => prev.map(markFriend));
        setSuggestions(prev => prev.filter(row => row.id !== person.id));
        setIncomingByFromId(prev => {
          const next = new Map(prev);
          next.delete(person.id);
          return next;
        });
        await loadFriendStore(userId);
        await loadPendingRequests(userId);
        await refreshFriends({force: true});
        void useInAppNotificationStore.getState().refresh(userId);
      } catch (e) {
        const msg = friendActionErrorText(e, t('friendsScreen.actionFailed'));
        Alert.alert(t('friendProfile.couldNotAccept'), msg, [
          {text: t('common.cancel'), style: 'cancel'},
          {
            text: t('friendsScreen.searchRetry'),
            onPress: () => void handleAccept(person),
          },
        ]);
      } finally {
        releaseActionLock(person.id);
      }
    },
    [
      userId,
      t,
      loadFriendStore,
      loadPendingRequests,
      refreshFriends,
      releaseActionLock,
    ],
  );

  const listData: PeopleRow[] = useMemo(() => {
    if (isSearching) {
      return searchResults;
    }
    return alphabeticalFriends.map(f => ({
      id: f.id,
      name: f.name,
      username: f.username,
      avatar: f.avatar,
      isFriend: true,
      isOnline: f.isOnline,
      gymName: f.gymName,
      checkInTime: f.checkInTime,
      status: 'friend' as const,
    }));
  }, [isSearching, searchResults, alphabeticalFriends]);

  const renderSubtitle = (item: PeopleRow) => {
    if (isSearching && item.username) {
      return `@${item.username}`;
    }
    if (item.isOnline) {
      return item.gymName
        ? t('addFriend.trainingNowAt', {gym: item.gymName})
        : t('online.trainingNow');
    }
    if (item.isFriend && item.checkInTime) {
      return t('friendsScreen.lastCheckIn', {
        time: formatRelativeTime(item.checkInTime, language),
      });
    }
    if (item.username) {
      return `@${item.username}`;
    }
    return null;
  };

  const handleToggleFollow = useCallback(
    async (person: PeopleRow) => {
      if (!userId || person.id === userId || followLocksRef.current.has(person.id)) {
        return;
      }
      if (useBlockStore.getState().blockedIds.has(person.id)) {
        return;
      }
      const wasFollowing = followedIds.has(person.id);
      followLocksRef.current.add(person.id);
      setFollowBusyId(person.id);
      setFollowedIds(prev => {
        const next = new Set(prev);
        if (wasFollowing) {
          next.delete(person.id);
        } else {
          next.add(person.id);
        }
        return next;
      });
      try {
        if (wasFollowing) {
          await unfollowProfile(person.id);
        } else {
          await followProfile(person.id);
        }
      } catch (e) {
        setFollowedIds(prev => {
          const next = new Set(prev);
          if (wasFollowing) {
            next.add(person.id);
          } else {
            next.delete(person.id);
          }
          return next;
        });
        const msg = isFriendActionUnavailableError(e)
          ? t('friendsScreen.followFailed')
          : friendActionErrorText(e, t('friendsScreen.followFailed'));
        Alert.alert(t('friendsScreen.followFailed'), msg);
      } finally {
        followLocksRef.current.delete(person.id);
        setFollowBusyId(prev => (prev === person.id ? null : prev));
      }
    },
    [userId, followedIds, t],
  );

  const renderFollow = (item: PeopleRow) => {
    if (item.id === userId) {
      return null;
    }
    const following = followedIds.has(item.id);
    const busy = followBusyId === item.id;
    return (
      <Pressable
        testID={`person-follow-${item.username ?? item.id}`}
        style={({pressed}) => [
          following ? styles.followingBtn : styles.followBtn,
          (pressed || busy) && styles.actionPressed,
        ]}
        onPress={() => void handleToggleFollow(item)}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(following ? 'friendsScreen.followingA11y' : 'friendsScreen.followA11y', {
          name: item.name,
        })}>
        {busy ? (
          <ActivityIndicator size="small" color={following ? colors.primary : colors.white} />
        ) : (
          <Text style={following ? styles.followingBtnText : styles.followBtnText}>
            {t(following ? 'friendsScreen.following' : 'friendsScreen.follow')}
          </Text>
        )}
      </Pressable>
    );
  };

  const renderAction = (item: PeopleRow) => {
    if (item.id === userId) {
      return null;
    }
    const busy = actionBusyId === item.id;
    if (!isSearching && item.status === 'friend') {
      return (
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      );
    }
    if (item.status === 'friend') {
      return (
        <View style={styles.statusPill}>
          <Icon name="checkmark" size={14} color={colors.success} />
          <Text style={styles.statusPillText}>
            {t('friendsScreen.friendsStatus')}
          </Text>
        </View>
      );
    }
    if (item.status === 'pending_sent') {
      return (
        <Text style={styles.requestedText}>{t('friendsScreen.requested')}</Text>
      );
    }
    if (item.status === 'pending_received') {
      return (
        <Pressable
          style={({pressed}) => [
            styles.acceptBtn,
            (pressed || busy) && styles.actionPressed,
          ]}
          onPress={() => void handleAccept(item)}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('friendsScreen.accept')}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.acceptBtnText}>{t('friendsScreen.accept')}</Text>
          )}
        </Pressable>
      );
    }
    return (
      <Pressable
        style={({pressed}) => [
          styles.addBtn,
          (pressed || busy) && styles.actionPressed,
        ]}
        onPress={() => void handleSendRequest(item)}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('friendsScreen.add')}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={styles.addBtnText}>{t('friendsScreen.add')}</Text>
        )}
      </Pressable>
    );
  };

  const renderRow = ({
    item,
    index,
    total,
  }: {
    item: PeopleRow;
    index: number;
    total?: number;
  }) => {
    const subtitle = renderSubtitle(item);
    const count = total ?? listData.length;
    const isFirst = index === 0;
    const isLast = index === count - 1;
    return (
      <View
        style={[
          styles.row,
          isFirst && styles.rowFirst,
          isLast && styles.rowLast,
          !isLast && styles.rowSeparator,
        ]}>
        <Pressable
          style={styles.rowMain}
          onPress={() => openPersonProfile(item)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.openProfile', {name: item.name})}>
          <View style={styles.avatarSlot}>
            <Avatar
              name={item.name}
              imageUrl={item.avatar}
              size="md"
            />
            {item.isOnline ? <View style={styles.onlineDot} /> : null}
          </View>
          <View style={styles.rowText}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View style={styles.rowAction}>
          {renderFollow(item)}
          {renderAction(item)}
        </View>
      </View>
    );
  };

  const suggestPhase = gymSuggestPhase({
    centerKnown,
    centerId: primaryCenterId,
    loading: suggestLoading,
    error: suggestError,
    count: suggestions.length,
  });

  const gymSuggestionsBlock = !isSearching ? (
    <View style={styles.gymBlock}>
      <Text style={styles.sectionLabel}>{t('friendsScreen.gymMatesTitle')}</Text>
      {suggestPhase === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.gymStatus} />
      ) : null}
      {suggestPhase === 'error' ? (
        <Pressable style={styles.gymStatus} onPress={() => void loadGymSuggestions()}>
          <Text style={styles.searchErrorText}>{t('friendsScreen.gymMatesError')}</Text>
          <Text style={styles.searchRetryText}>{t('friendsScreen.gymMatesRetry')}</Text>
        </Pressable>
      ) : null}
      {suggestPhase === 'noGym' ? (
        <View style={styles.gymStatus}>
          <Text style={styles.gymHint}>{t('friendsScreen.gymMatesNoGym')}</Text>
          <Pressable
            style={styles.gymCta}
            onPress={() => setCentersSheetOpen(true)}
            accessibilityRole="button">
            <Text style={styles.gymCtaText}>{t('friendsScreen.gymMatesChooseGym')}</Text>
          </Pressable>
        </View>
      ) : null}
      {suggestPhase === 'empty' ? (
        <Text style={styles.gymHint}>{t('friendsScreen.gymMatesEmpty')}</Text>
      ) : null}
      {suggestPhase === 'ready' ? (
        <View style={styles.gymList}>
          {suggestions.map((item, index) => (
            <View key={item.id}>
              {renderRow({item, index, total: suggestions.length})}
            </View>
          ))}
          {suggestError ? (
            <Pressable style={styles.gymStatus} onPress={() => void loadGymSuggestions()}>
              <Text style={styles.searchErrorText}>{t('friendsScreen.gymMatesError')}</Text>
              <Text style={styles.searchRetryText}>{t('friendsScreen.gymMatesRetry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {primaryCenterId && discoverableKnown ? (
        <Text
          style={styles.gymVisibilityStatus}
          testID="gym-visibility-status"
          accessibilityLabel={t('friendsScreen.gymMatesStatusLabel', {
            status: discoverableAtGym
              ? t('friendsScreen.gymMatesStatusOn')
              : t('friendsScreen.gymMatesStatusOff'),
          })}>
          {t('friendsScreen.gymMatesStatusLabel', {
            status: discoverableAtGym
              ? t('friendsScreen.gymMatesStatusOn')
              : t('friendsScreen.gymMatesStatusOff'),
          })}
        </Text>
      ) : null}
      {primaryCenterId && discoverableKnown && !discoverableAtGym && suggestPhase !== 'loading' && suggestPhase !== 'error' ? (
        <Pressable
          style={styles.gymOptIn}
          onPress={() => void enableGymDiscoverable()}
          disabled={optInBusy}
          accessibilityRole="button">
          <Text style={styles.gymOptInTitle}>{t('friendsScreen.gymMatesOptIn')}</Text>
          <Text style={styles.gymHint}>{t('friendsScreen.gymMatesOptInHint')}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const listHeader = (
    <View style={styles.listHeader}>
      {gymSuggestionsBlock}
      {!isSearching && pendingFriendRequests > 0 ? (
        <Pressable
          style={styles.requestsRow}
          onPress={openFriendRequestsSheet}
          accessibilityRole="button"
          accessibilityLabel={tp('friendsScreen.friendRequestsCount', pendingFriendRequests)}
          testID="friend-requests-count">
          <Icon name="mail-unread-outline" size={18} color={colors.primary} />
          <Text style={styles.requestsRowText}>
            {tp('friendsScreen.friendRequestsCount', pendingFriendRequests)}
          </Text>
          <Icon name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {isSearching && searchError ? (
        <Pressable
          style={styles.searchStatusRow}
          onPress={() => {
            lastStartedSearchQueryRef.current = null;
            void runRemoteSearchRef.current(searchQuery.trim());
          }}>
          <Text style={styles.searchErrorText}>{searchError}</Text>
          <Text style={styles.searchRetryText}>
            {t('friendsScreen.searchRetry')}
          </Text>
        </Pressable>
      ) : null}

      {isInviteFiveFriendsSurfaceEnabled() && !isSearching ? (
        <>
          <Pressable
            onPress={openInviteFiveFriends}
            hitSlop={8}
            style={styles.inviteLink}
            testID="invite-friends-entry">
            <Text style={styles.inviteLinkText}>
              {t('inviteFive.friendsEntry')}
            </Text>
          </Pressable>
          <Pressable
            onPress={openContactInvite}
            hitSlop={8}
            style={styles.inviteLink}
            testID="invite-from-contacts"
            accessibilityRole="button"
            accessibilityLabel={t('friendsScreen.inviteFromContacts')}>
            <Text style={styles.inviteLinkText}>
              {t('friendsScreen.inviteFromContacts')}
            </Text>
          </Pressable>
        </>
      ) : null}
      {isInviteFiveFriendsSurfaceEnabled() && !isSearching ? (
        <ManualInviteCodeCard />
      ) : null}

      {!isSearching && alphabeticalFriends.length > 0 ? (
        <Text style={styles.sectionLabel}>
          {t('friendsScreen.yourFriends', {count: alphabeticalFriends.length})}
        </Text>
      ) : null}
    </View>
  );

  const emptyComponent = () => {
    if (loadingFriends && !isSearching) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (isSearching) {
      if (searchLoading) {
        return null;
      }
      if (searchError) {
        return null;
      }
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('friendsScreen.searchNoResults')}</Text>
          <Text style={styles.emptyMessage}>
            {t('friendsScreen.searchNoResultsHint')}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIcon}>
          <Icon name="people-outline" size={40} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>{t('friendsScreen.emptyTitle')}</Text>
        <Text style={styles.emptyMessage}>
          {t('friendsScreen.emptyMessage')}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SocialSearchBar
        inputRef={searchInputRef}
        testID="friends-search-input"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t('friendsScreen.searchPlaceholder')}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.searchOuter}
        loading={isSearching && searchLoading}
        reserveLoadingSlot={isSearching}
      />

      <FlatList
        ref={listRef}
        data={listData}
        renderItem={renderRow}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        maxToRenderPerBatch={10}
        windowSize={8}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={
          listData.length === 0 ? styles.emptyList : styles.list
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        showsVerticalScrollIndicator={false}
      />
      <EditProfileCentersSheet
        visible={centersSheetOpen}
        initialCenterIds={homeGymIds}
        onClose={() => setCentersSheetOpen(false)}
        onSave={saveHomeGyms}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchOuter: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: 50,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listHeader: {
    marginBottom: spacing.xs,
  },
  gymBlock: {
    marginBottom: spacing.md,
  },
  gymList: {
    marginBottom: spacing.sm,
  },
  gymStatus: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  gymHint: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: spacing.xs,
  },
  gymCta: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  gymCtaText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  gymOptIn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  gymVisibilityStatus: {
    ...typography.small,
    color: colors.text,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  gymOptInTitle: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  requestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  requestsRowText: {
    flex: 1,
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  inviteLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  inviteLinkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 64,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowFirst: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLast: {
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: spacing.sm,
  },
  avatarSlot: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    marginRight: spacing.md,
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 3,
    lineHeight: 16,
  },
  rowAction: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    minWidth: 72,
  },
  followBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  followBtnText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
  followingBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: '#F5F3FF',
  },
  followingBtnText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusPillText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  requestedText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: 110,
  },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '10',
    minWidth: 72,
    alignItems: 'center',
  },
  addBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  acceptBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minWidth: 80,
    alignItems: 'center',
  },
  acceptBtnText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700',
  },
  actionPressed: {
    opacity: 0.7,
  },
  centered: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyMessage: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  searchStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  searchStatusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  searchErrorText: {
    ...typography.caption,
    color: '#DC2626',
    flex: 1,
  },
  searchRetryText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
});

export default FriendsScreen;
