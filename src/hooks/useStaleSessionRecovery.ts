import {useEffect, useRef} from 'react';
import {Alert} from 'react-native';
import {useAppStore} from '@/store/appStore';
import {useSessionStore} from '@/store/sessionStore';
import {getActiveCheckInForUser} from '@/services/supabase/checkInService';
import {finishWorkoutSession} from '@/services/session/finishWorkoutSession';
import {ACTIVE_SESSION_RECOVERY_PROMPT_MS} from '@/services/supabase/activeSessionsSync';

/**
 * Sessioner ældre end 12t: spørg brugeren — auto-afslut aldrig.
 */
export function useStaleSessionRecovery(): void {
  const userId = useAppStore(s => s.user?.id);
  const checkInId = useSessionStore(s => s.activeSession?.checkInId);
  const prompted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId || !checkInId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await getActiveCheckInForUser(userId);
        if (cancelled || !row?.started_at || row.id !== checkInId) {
          return;
        }
        const ageMs = Date.now() - new Date(row.started_at).getTime();
        if (ageMs < ACTIVE_SESSION_RECOVERY_PROMPT_MS) {
          return;
        }
        if (prompted.current.has(row.id)) {
          return;
        }
        prompted.current.add(row.id);
        Alert.alert(
          'Aktiv træning',
          'Du har stadig en aktiv træning fra tidligere. Vil du afslutte den nu?',
          [
            {text: 'Fortsæt', style: 'cancel'},
            {
              text: 'Afslut træning',
              style: 'destructive',
              onPress: () => {
                void finishWorkoutSession({
                  reason: 'manual',
                  userId,
                  checkInId: row.id,
                });
              },
            },
          ],
        );
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, checkInId]);
}
