/**
 * __DEV__ kun: simulér auto-checkout uden at vente timer/afstande.
 * Kald f.eks. fra en skjult debug-scene eller manuelt i App.tsx.
 */

const MS_HOUR = 60 * 60 * 1000;

let devOverrideDistanceM: number | null = null;
let devOverrideLastSeenHoursAgo: number | null = null;
let devOverrideAwayStartedMinutesAgo: number | null = null;

export function setAutoCheckoutDevOverrides(o: {
  /** Simuler afstand i meter (null = brug ægte GPS) */
  distanceMeters?: number | null;
  /** Træk last_seen "tilbage" så mange timer (inaktivitet) */
  lastSeenHoursAgo?: number | null;
  /** Sæt "væk" start så mange minutter siden (fx 16 for buffer) */
  awayStartedMinutesAgo?: number | null;
}): void {
  if (!__DEV__) {
    return;
  }
  devOverrideDistanceM =
    o.distanceMeters === undefined ? devOverrideDistanceM : o.distanceMeters;
  devOverrideLastSeenHoursAgo =
    o.lastSeenHoursAgo === undefined
      ? devOverrideLastSeenHoursAgo
      : o.lastSeenHoursAgo;
  devOverrideAwayStartedMinutesAgo =
    o.awayStartedMinutesAgo === undefined
      ? devOverrideAwayStartedMinutesAgo
      : o.awayStartedMinutesAgo;
}

export function clearAutoCheckoutDevOverrides(): void {
  if (!__DEV__) {
    return;
  }
  devOverrideDistanceM = null;
  devOverrideLastSeenHoursAgo = null;
  devOverrideAwayStartedMinutesAgo = null;
}

export function getAutoCheckoutDevDistanceOverride(): number | null {
  return __DEV__ ? devOverrideDistanceM : null;
}

/**
 * Justerer last_seen tidsstempel for evaluering (inaktivitet).
 * Returnerer ISO eller original hvis override ikke aktiv.
 */
export function applyLastSeenInactivityOverride(
  lastSeen: string | null,
  _startedAt: string,
): string | null {
  if (!__DEV__ || devOverrideLastSeenHoursAgo == null) {
    return lastSeen;
  }
  const at = new Date();
  at.setTime(at.getTime() - devOverrideLastSeenHoursAgo * MS_HOUR);
  return at.toISOString();
}

/**
 * Syntetisk away_started hvis minutter-override (simuler lang tid ude).
 */
export function getEffectiveAwayStartedAt(
  rowAway: string | null,
  _now: Date = new Date(),
): string | null {
  if (!__DEV__ || devOverrideAwayStartedMinutesAgo == null) {
    return rowAway;
  }
  const at = new Date();
  at.setTime(at.getTime() - devOverrideAwayStartedMinutesAgo * 60 * 1000);
  return at.toISOString();
}

export function isDevInactivityOverrideActive(): boolean {
  return __DEV__ && devOverrideLastSeenHoursAgo != null;
}
