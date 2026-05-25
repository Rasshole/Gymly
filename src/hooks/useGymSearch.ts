import {useEffect, useMemo, useState} from 'react';
import type {DanishGym} from '@/data/danishGyms';
import {
  searchGyms,
  type GymSearchHit,
  type GymSearchOptions,
} from '@/services/gymSearch/gymSearchEngine';

const DEBOUNCE_MS = 120;

export function useGymSearch(
  query: string,
  options: Omit<GymSearchOptions, 'gyms'> & {gyms?: DanishGym[]},
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setDebouncedQuery('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const favoriteKey = options.favoriteIds?.join(',') ?? '';

  const hits: GymSearchHit[] = useMemo(
    () => searchGyms(debouncedQuery, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- favoriteKey stabilizes array dep
    [debouncedQuery, options.userLat, options.userLng, favoriteKey, options.limit, options.minScore, options.gyms],
  );

  const isActive = debouncedQuery.trim().length > 0;
  const showLoading = isSearching && query.trim().length > 0;

  return {
    hits,
    isActive,
    showLoading,
    debouncedQuery,
  };
}
