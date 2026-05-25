import {useState, useEffect, useRef, useCallback} from 'react';
import {
  getUsernameFormatError,
  normalizeUsernameForStorage,
  isUsernameFormatValid,
} from '@/utils/usernameRules';
import type {AppLanguage} from '@/i18n';
import {isUsernameAvailableInSupabase} from '@/services/supabase/usernameAvailabilityService';

export type UsernameAvailabilityState = {
  /** Trimmet lowercase til visning / API */
  normalized: string;
  formatError: string | null;
  /** null = ukendt / checker; true = ledig; false = optaget */
  available: boolean | null;
  checking: boolean;
};

const DEBOUNCE_MS = 300;

/**
 * Debounced format + Supabase-rpc for ledigt brugernavn.
 * unchangedNormalized: når lig med normalized → available true uden netværk.
 */
export function useUsernameAvailability(params: {
  rawUsername: string;
  excludeUserId?: string | null;
  /** Når sandt, spring availability-RPC over og sæt available=true */
  unchangedNormalized?: string | null;
  language?: AppLanguage;
}) {
  const {rawUsername, excludeUserId, unchangedNormalized, language = 'da'} = params;
  const [state, setState] = useState<UsernameAvailabilityState>({
    normalized: '',
    formatError: null,
    available: null,
    checking: false,
  });
  const seq = useRef(0);

  const runCheck = useCallback(
    async (normalized: string) => {
      if (!isUsernameFormatValid(normalized)) {
        setState({
          normalized,
          formatError: getUsernameFormatError(language, normalized),
          available: null,
          checking: false,
        });
        return;
      }
      if (
        unchangedNormalized != null &&
        normalized === unchangedNormalized
      ) {
        setState({
          normalized,
          formatError: null,
          available: true,
          checking: false,
        });
        return;
      }
      const mySeq = ++seq.current;
      setState(s => ({
        ...s,
        normalized,
        formatError: null,
        available: null,
        checking: true,
      }));
      const ok = await isUsernameAvailableInSupabase(normalized, excludeUserId);
      if (seq.current !== mySeq) {
        return;
      }
      setState({
        normalized,
        formatError: null,
        available: ok,
        checking: false,
      });
    },
    [excludeUserId, unchangedNormalized],
  );

  useEffect(() => {
    const normalized = normalizeUsernameForStorage(rawUsername);
    if (!normalized) {
      setState({
        normalized: '',
        formatError: null,
        available: null,
        checking: false,
      });
      return;
    }
    const formatErr = getUsernameFormatError(language, normalized);
    if (formatErr) {
      setState({
        normalized,
        formatError: formatErr,
        available: null,
        checking: false,
      });
      return;
    }
    const t = setTimeout(() => {
      void runCheck(normalized);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawUsername, language, runCheck]);

  const canProceed =
    state.normalized.length > 0 &&
    !state.formatError &&
    isUsernameFormatValid(state.normalized) &&
    state.available === true &&
    !state.checking;

  return {...state, canProceed};
}
