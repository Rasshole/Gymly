/**
 * MapScreen viewport → marker runtime controller.
 *
 * Separates discovery-map geography from GPS / "Near you" / selected cards.
 * Critical for iOS Apple Maps: `onRegionChange` MUST be registered or
 * `AIRMapManager` never emits `onRegionChangeComplete` (see native guard
 * `if (mapView.onRegionChange)` in react-native-maps AIRMapManager.m).
 */
import type {Region} from 'react-native-maps';
import type {MapCenter} from '@/data/mapCentersData';
import type {MapCenterSpatialIndex} from '@/utils/mapCenterSpatialIndex';
import {
  clusterMapCentersForDisplay,
  type MapDisplayMarker,
} from '@/utils/mapMarkerClustering';
import {normalizeMapRegion} from '@/utils/normalizeMapRegion';
import {selectVisibleMapMarkers} from '@/utils/selectVisibleMapMarkers';

export const MAP_REGION_MARKER_DEBOUNCE_MS = 400;

export type MapViewportMarkerControllerOptions = {
  index: MapCenterSpatialIndex;
  initialRegion: Region;
  debounceMs?: number;
  maxMarkers?: number;
  getSelectedId?: () => string | null | undefined;
  getCenterById?: () => ReadonlyMap<string, MapCenter> | undefined;
  onMarkersChange?: (markers: MapDisplayMarker[], settledRegion: Region) => void;
};

export class MapViewportMarkerController {
  private readonly index: MapCenterSpatialIndex;
  private readonly debounceMs: number;
  private readonly maxMarkers: number | undefined;
  private readonly getSelectedId?: () => string | null | undefined;
  private readonly getCenterById?: () => ReadonlyMap<string, MapCenter> | undefined;
  private readonly onMarkersChange?: (
    markers: MapDisplayMarker[],
    settledRegion: Region,
  ) => void;

  private latestRegion: Region;
  private settledRegion: Region;
  private markers: MapDisplayMarker[];
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = true;

  constructor(options: MapViewportMarkerControllerOptions) {
    this.index = options.index;
    this.debounceMs = options.debounceMs ?? MAP_REGION_MARKER_DEBOUNCE_MS;
    this.maxMarkers = options.maxMarkers;
    this.getSelectedId = options.getSelectedId;
    this.getCenterById = options.getCenterById;
    this.onMarkersChange = options.onMarkersChange;
    this.latestRegion = options.initialRegion;
    this.settledRegion = options.initialRegion;
    this.markers = this.compute(options.initialRegion);
  }

  getLatestRegion(): Region {
    return this.latestRegion;
  }

  getSettledRegion(): Region {
    return this.settledRegion;
  }

  getMarkers(): MapDisplayMarker[] {
    return this.markers;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.clearTimer();
    }
  }

  /**
   * Continuous pan/zoom. Must stay registered on iOS so complete events fire.
   * Updates the latest-region ref only — markers settle on complete + debounce.
   */
  handleRegionChange(region: unknown): void {
    const normalized = normalizeMapRegion(region);
    if (!normalized) {
      return;
    }
    this.latestRegion = normalized;
  }

  /** Settled pan/zoom from MapView. */
  handleRegionChangeComplete(region: unknown): void {
    const normalized = normalizeMapRegion(region);
    if (!normalized) {
      return;
    }
    this.latestRegion = normalized;
    if (!this.active) {
      return;
    }
    this.schedule(normalized);
  }

  /**
   * Seed / force a region (initial GPS center, follow-mode landing).
   * Does not require MapView callbacks.
   */
  seedRegion(region: unknown, opts?: {immediate?: boolean}): void {
    const normalized = normalizeMapRegion(region);
    if (!normalized) {
      return;
    }
    this.latestRegion = normalized;
    if (opts?.immediate) {
      this.clearTimer();
      this.generation += 1;
      this.publish(normalized);
      return;
    }
    this.schedule(normalized);
  }

  /** Recompute from the latest settled region (e.g. selected gym changed). */
  recomputeFromSettled(): void {
    this.publish(this.settledRegion);
  }

  /** Test helper — advance debounce as if `ms` elapsed. */
  flushForTests(): void {
    if (this.timer == null) {
      return;
    }
    this.clearTimer();
    this.publish(this.latestRegion);
  }

  dispose(): void {
    this.clearTimer();
    this.active = false;
  }

  private schedule(_region: Region): void {
    this.clearTimer();
    const gen = ++this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (gen !== this.generation || !this.active) {
        return;
      }
      // Always publish the newest ref — ignore stale scheduled region snapshots.
      this.publish(this.latestRegion);
    }, this.debounceMs);
  }

  private publish(region: Region): void {
    this.settledRegion = region;
    this.markers = this.compute(region);
    this.onMarkersChange?.(this.markers, this.settledRegion);
  }

  private compute(region: Region): MapDisplayMarker[] {
    const centers = selectVisibleMapMarkers(this.index, region, {
      maxMarkers: this.maxMarkers,
      selectedId: this.getSelectedId?.(),
      centerById: this.getCenterById?.(),
    });
    return clusterMapCentersForDisplay(centers, region, this.maxMarkers);
  }

  private clearTimer(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
