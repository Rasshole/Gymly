/**
 * Normalize MapView region payloads from Apple Maps / Fabric event shapes.
 */
import type {Region} from 'react-native-maps';

function readNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Accepts either a Region or a nested `{ region: Region }` event payload.
 * Returns null when the region is unusable for spatial queries.
 */
export function normalizeMapRegion(input: unknown): Region | null {
  if (input == null || typeof input !== 'object') {
    return null;
  }
  const root = input as Record<string, unknown>;
  const nested =
    root.region != null && typeof root.region === 'object'
      ? (root.region as Record<string, unknown>)
      : root;

  const latitude = readNum(nested.latitude);
  const longitude = readNum(nested.longitude);
  const latitudeDelta = readNum(nested.latitudeDelta);
  const longitudeDelta = readNum(nested.longitudeDelta);

  if (
    latitude == null ||
    longitude == null ||
    latitudeDelta == null ||
    longitudeDelta == null
  ) {
    return null;
  }
  if (latitudeDelta <= 0 || longitudeDelta <= 0) {
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }

  return {latitude, longitude, latitudeDelta, longitudeDelta};
}

export function regionsApproxEqual(
  a: Region,
  b: Region,
  epsilon = 0.00008,
): boolean {
  return (
    Math.abs(a.latitude - b.latitude) <= epsilon &&
    Math.abs(a.longitude - b.longitude) <= epsilon &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) <= epsilon * 10 &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) <= epsilon * 10
  );
}
