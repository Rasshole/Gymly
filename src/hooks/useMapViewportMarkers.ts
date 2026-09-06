/**
 * React binding for MapViewportMarkerController — discovery-map markers only.
 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {Region} from 'react-native-maps';
import type {MapCenter} from '@/data/mapCentersData';
import type {MapCenterSpatialIndex} from '@/utils/mapCenterSpatialIndex';
import type {MapDisplayMarker} from '@/utils/mapMarkerClustering';
import {
  MAP_REGION_MARKER_DEBOUNCE_MS,
  MapViewportMarkerController,
} from '@/utils/mapViewportMarkerController';

export {MAP_REGION_MARKER_DEBOUNCE_MS};

type Args = {
  index: MapCenterSpatialIndex;
  initialRegion: Region;
  isActive: boolean;
  selectedId?: string | null;
  centerById?: ReadonlyMap<string, MapCenter>;
  debounceMs?: number;
};

export function useMapViewportMarkers({
  index,
  initialRegion,
  isActive,
  selectedId,
  centerById,
  debounceMs = MAP_REGION_MARKER_DEBOUNCE_MS,
}: Args): {
  mapDisplayMarkers: MapDisplayMarker[];
  settledMapRegion: Region;
  markerVisibilityEpoch: number;
  onRegionChange: (region: Region) => void;
  onRegionChangeComplete: (region: Region) => void;
  seedMapRegion: (region: Region, opts?: {immediate?: boolean}) => void;
} {
  const selectedIdRef = useRef(selectedId);
  const centerByIdRef = useRef(centerById);
  selectedIdRef.current = selectedId;
  centerByIdRef.current = centerById;

  const [mapDisplayMarkers, setMapDisplayMarkers] = useState<MapDisplayMarker[]>(
    [],
  );
  const [settledMapRegion, setSettledMapRegion] = useState<Region>(initialRegion);
  const [markerVisibilityEpoch, setMarkerVisibilityEpoch] = useState(0);

  const controller = useMemo(() => {
    return new MapViewportMarkerController({
      index,
      initialRegion,
      debounceMs,
      getSelectedId: () => selectedIdRef.current,
      getCenterById: () => centerByIdRef.current,
      onMarkersChange: (markers, region) => {
        setMapDisplayMarkers(markers);
        setSettledMapRegion(region);
        setMarkerVisibilityEpoch(epoch => epoch + 1);
      },
    });
    // index + initialRegion are stable for the MapScreen lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, debounceMs]);

  useEffect(() => {
    setMapDisplayMarkers(controller.getMarkers());
    setSettledMapRegion(controller.getSettledRegion());
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    controller.setActive(isActive);
  }, [controller, isActive]);

  useEffect(() => {
    controller.recomputeFromSettled();
  }, [controller, selectedId, centerById]);

  const onRegionChange = useCallback(
    (region: Region) => {
      controller.handleRegionChange(region);
    },
    [controller],
  );

  const onRegionChangeComplete = useCallback(
    (region: Region) => {
      controller.handleRegionChangeComplete(region);
    },
    [controller],
  );

  const seedMapRegion = useCallback(
    (region: Region, opts?: {immediate?: boolean}) => {
      controller.seedRegion(region, opts);
    },
    [controller],
  );

  return {
    mapDisplayMarkers,
    settledMapRegion,
    markerVisibilityEpoch,
    onRegionChange,
    onRegionChangeComplete,
    seedMapRegion,
  };
}
