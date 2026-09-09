/**
 * In-app Google Play prominent location disclosure — promise bridge for non-React callers.
 * Affirmative Agree must be chosen before any Android location runtime request.
 */

type PendingDisclosure = {
  resolve: (accepted: boolean) => void;
};

type Listener = () => void;

let pending: PendingDisclosure | null = null;
const listeners = new Set<Listener>();

export function isLocationDisclosurePending(): boolean {
  return pending != null;
}

export function subscribeLocationDisclosure(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach(l => l());
}

/** Shows the Gymly disclosure modal; resolves true only on explicit Agree. */
export function presentLocationProminentDisclosure(): Promise<boolean> {
  if (pending) {
    return new Promise(resolve => {
      const prev = pending!;
      pending = {
        resolve: accepted => {
          prev.resolve(false);
          resolve(accepted);
        },
      };
      notify();
    });
  }
  return new Promise(resolve => {
    pending = {resolve};
    notify();
  });
}

/** Called from the modal — only Agree → true; Not now / dismiss → false. */
export function resolveLocationProminentDisclosure(accepted: boolean): void {
  const current = pending;
  pending = null;
  notify();
  current?.resolve(accepted);
}

/** Test helper — clears any hung promise. */
export function __resetLocationDisclosureGateForTests(): void {
  if (pending) {
    pending.resolve(false);
    pending = null;
  }
  notify();
}
