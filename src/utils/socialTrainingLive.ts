/**
 * Live træningsvarighed til Venner-fanen (Dansk).
 */
export function formatTrainingDurationDa(startedAt: Date, nowMs: number = Date.now()): string {
  const elapsed = Math.max(0, nowMs - startedAt.getTime());
  const minsTotal = Math.floor(elapsed / 60_000);
  if (minsTotal < 1) {
    return 'Lige startet';
  }
  if (minsTotal < 15) {
    return `Startede for ${minsTotal} min siden`;
  }
  if (minsTotal < 60) {
    return `${minsTotal} min i gang`;
  }
  const h = Math.floor(minsTotal / 60);
  const m = minsTotal % 60;
  return `${h}t ${m}m i gang`;
}
