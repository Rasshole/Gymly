/**
 * Dev-only phase timings. One line per phase so device logs can be diffed.
 * `ms` is milliseconds since perfStart for that flow.
 */
const starts = new Map<string, number>();

function emit(line: string): void {
  console.log(line);
  try {
    // Lazy require: this module is imported while supabaseClient is still loading.
    const {isLocalQaSupabaseBackend, SUPABASE_URL} = require('@/config/supabaseConfig') as {
      isLocalQaSupabaseBackend: () => boolean;
      SUPABASE_URL: string;
    };
    if (!isLocalQaSupabaseBackend() || !SUPABASE_URL) {
      return;
    }
    const host = new URL(SUPABASE_URL).hostname;
    void fetch(`http://${host}:8765/perf`, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: line,
    }).catch(() => {});
  } catch {
    /* collector is optional */
  }
}

export function perfStart(flow: string, phase = 'tap'): void {
  if (!__DEV__) {
    return;
  }
  starts.set(flow, Date.now());
  emit(`[PERF] flow=${flow} phase=${phase} ms=0`);
}

export function perfHas(flow: string): boolean {
  return starts.has(flow);
}

export function perfEnd(flow: string): void {
  starts.delete(flow);
}

export function perfPhase(flow: string, phase: string, extra?: string): void {
  if (!__DEV__) {
    return;
  }
  const started = starts.get(flow);
  const ms = started == null ? -1 : Date.now() - started;
  emit(
    `[PERF] flow=${flow} phase=${phase} ms=${ms}${extra ? ` ${extra}` : ''}`,
  );
}
