import {useEffect} from 'react';
import {useAppStore} from '@/store/appStore';
import {useDemoModeStore} from '@/demo/demoModeStore';
import {seedDemoStores} from '@/demo/seedDemoStores';

/**
 * Synkroniser persisted demo-tilstand + seed når bruger er logget ind.
 * Ingen overlay/banner — overlay med høj z-index kan blokere scroll/tabs på iOS.
 */
export function DemoContentOrchestrator() {
  const userId = useAppStore(s => s.user?.id);
  const enabled = useDemoModeStore(s => s.enabled);
  const hydrated = useDemoModeStore(s => s.hydrated);

  useEffect(() => {
    useDemoModeStore.getState().hydrateFromStorage().catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated || !userId || !enabled) {
      return;
    }
    try {
      seedDemoStores(userId);
    } catch (e) {
      if (__DEV__) {
        console.warn('[DemoContentOrchestrator] seedDemoStores failed', e);
      }
    }
  }, [hydrated, userId, enabled]);

  return null;
}
