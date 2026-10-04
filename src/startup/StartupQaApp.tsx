/**
 * TEMPORARY __DEV__ visible startup binary-search.
 *
 * Flip STARTUP_QA_ENABLED to false (or remove this entry from index.js) after QA.
 * Auto-advances stages; if the device hangs, the last painted stage is the blocker.
 */

import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';

/** Set false to boot normal App without the QA harness. */
export const STARTUP_QA_ENABLED = false;

type StageId = 1 | 2 | 3 | 4 | 5 | 6;

const STAGE_LABEL: Record<StageId, string> = {
  1: 'Bare React root',
  2: 'LanguageProvider',
  3: 'Auth/session hydrate',
  4: 'Navigation container',
  5: 'RootNavigator / onboarding decision',
  6: 'Normal app shell',
};

function StageBoard({
  completed,
  current,
  error,
}: {
  completed: StageId[];
  current: StageId;
  error: string | null;
}) {
  return (
    <ScrollView contentContainerStyle={styles.board}>
      <Text style={styles.title}>GYMLY STARTUP QA</Text>
      <Text style={styles.sub}>Last stage painted = blocker if hang</Text>
      {([1, 2, 3, 4, 5, 6] as StageId[]).map(id => {
        const done = completed.includes(id);
        const active = current === id && !done;
        const mark = done ? '✓' : active ? '…' : '·';
        return (
          <Text
            key={id}
            style={[
              styles.line,
              done && styles.done,
              active && styles.active,
            ]}>
            Stage {id}: {STAGE_LABEL[id]} {mark}
          </Text>
        );
      })}
      {error ? <Text style={styles.err}>ERROR: {error}</Text> : null}
    </ScrollView>
  );
}

/**
 * Stage 1 only — no App, no i18n packs, no auth, no nav, no centers.
 */
export default function StartupQaApp() {
  const [completed, setCompleted] = useState<StageId[]>([]);
  const [current, setCurrent] = useState<StageId>(1);
  const [error, setError] = useState<string | null>(null);
  const [FullApp, setFullApp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mark = (id: StageId) => {
      if (!cancelled) {
        setCompleted(prev => (prev.includes(id) ? prev : [...prev, id]));
      }
    };
    const bump = (id: StageId) => {
      if (!cancelled) {
        setCurrent(id);
      }
    };

    (async () => {
      try {
        // Stage 1 already painted by first render.
        mark(1);
        await delay(50);

        bump(2);
        const {LanguageProvider} =
          require('@/i18n/LanguageContext') as typeof import('@/i18n/LanguageContext');
        // Force evaluate provider module; mount happens via FullApp path below.
        if (!LanguageProvider) {
          throw new Error('LanguageProvider missing');
        }
        mark(2);
        await delay(50);

        bump(3);
        const {useAppStore} =
          require('@/store/appStore') as typeof import('@/store/appStore');
        await useAppStore.getState().initialize();
        mark(3);
        await delay(50);

        bump(4);
        require('@react-navigation/native');
        mark(4);
        await delay(50);

        bump(5);
        require('@/navigation/RootNavigator');
        // Intentionally do NOT require AuthNavigator/RegisterScreen here.
        mark(5);
        await delay(50);

        bump(6);
        const AppMod = require('../../App') as {default: React.ComponentType};
        if (cancelled) {
          return;
        }
        setFullApp(() => AppMod.default);
        mark(6);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (FullApp && completed.includes(6) && !error) {
    return <FullApp />;
  }

  return (
    <View style={styles.root}>
      <StageBoard completed={completed} current={current} error={error} />
    </View>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#FFFFFF'},
  board: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  sub: {fontSize: 13, color: '#666', marginBottom: 20},
  line: {fontSize: 16, color: '#999', marginBottom: 10, fontWeight: '600'},
  done: {color: '#1B7F3A'},
  active: {color: '#6B4EFF'},
  err: {marginTop: 16, color: '#B00020', fontSize: 14, fontWeight: '600'},
});
