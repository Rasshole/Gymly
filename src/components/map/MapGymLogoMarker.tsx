/**
 * Map marker with gym logo — enables tracksViewChanges briefly so RN Maps
 * snapshots the logo, then disables for smooth pans.
 */
import React, {memo, useEffect, useRef, useState} from 'react';
import {Marker} from 'react-native-maps';
import MapGymMarkerView from '@/components/map/MapGymMarkerView';
import type {MapCenter} from '@/data/mapCentersData';
import type {DanishGym} from '@/data/danishGyms';

type Props = {
  center: MapCenter;
  gym: DanishGym;
  selected: boolean;
  onPress: (gym: DanishGym) => void;
};

const LOGO_TRACK_MS = 450;
const SELECT_TRACK_MS = 350;
/** Only gyms with a live badge need a custom snapshot. The rest use a native pin. */
const MAX_CONCURRENT_TRACKS = 4;
let activeTracks = 0;
const trackWaiters: Array<() => void> = [];
let snapshotBatchStarted = 0;
let snapshotBatchCount = 0;
let snapshotInflight = 0;
const snapshotDrainListeners = new Set<(count: number, elapsedMs: number) => void>();

export function subscribeMapSnapshotDrain(
  listener: (count: number, elapsedMs: number) => void,
): () => void {
  snapshotDrainListeners.add(listener);
  return () => {
    snapshotDrainListeners.delete(listener);
  };
}

function noteSnapshotStart(): void {
  if (snapshotInflight === 0) {
    snapshotBatchStarted = Date.now();
    snapshotBatchCount = 0;
  }
  snapshotInflight += 1;
  snapshotBatchCount += 1;
}

function noteSnapshotDone(): void {
  snapshotInflight = Math.max(0, snapshotInflight - 1);
  if (snapshotInflight === 0 && snapshotBatchCount > 0) {
    const elapsedMs = Date.now() - snapshotBatchStarted;
    const count = snapshotBatchCount;
    snapshotBatchCount = 0;
    snapshotDrainListeners.forEach(listener => listener(count, elapsedMs));
  }
}

function pumpTrackSlots(): void {
  while (activeTracks < MAX_CONCURRENT_TRACKS && trackWaiters.length > 0) {
    const next = trackWaiters.shift();
    next?.();
  }
}

function requestTrackSlot(run: () => void): () => void {
  let cancelled = false;
  const start = () => {
    if (cancelled) {
      pumpTrackSlots();
      return;
    }
    activeTracks += 1;
    noteSnapshotStart();
    run();
  };
  if (activeTracks < MAX_CONCURRENT_TRACKS) {
    start();
  } else {
    trackWaiters.push(start);
  }
  return () => {
    cancelled = true;
  };
}

function releaseTrackSlot(): void {
  activeTracks = Math.max(0, activeTracks - 1);
  noteSnapshotDone();
  pumpTrackSlots();
}

const MapGymLogoMarker = memo(function MapGymLogoMarker({
  center,
  gym,
  selected,
  onPress,
}: Props) {
  const needsSnapshot =
    selected || center.totalActiveCount > 0 || center.friendsActiveCount > 0;
  const [tracksViewChanges, setTracksViewChanges] = useState(false);
  const wasSelectedRef = useRef(false);

  useEffect(() => {
    if (!needsSnapshot) {
      return;
    }
    let released = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (released) {
        return;
      }
      released = true;
      releaseTrackSlot();
    };
    const cancelWait = requestTrackSlot(() => {
      setTracksViewChanges(true);
      timer = setTimeout(() => {
        setTracksViewChanges(false);
        finish();
      }, LOGO_TRACK_MS);
    });
    return () => {
      cancelWait();
      if (timer) {
        clearTimeout(timer);
        setTracksViewChanges(false);
        finish();
      }
    };
  }, [needsSnapshot, center.id, center.friendsActiveCount, center.totalActiveCount]);

  useEffect(() => {
    if (!selected && !wasSelectedRef.current) {
      return;
    }
    wasSelectedRef.current = selected;
    setTracksViewChanges(true);
    const t = setTimeout(() => setTracksViewChanges(false), SELECT_TRACK_MS);
    return () => clearTimeout(t);
  }, [selected]);

  if (!needsSnapshot) {
    return (
      <Marker
        identifier={center.id}
        coordinate={{
          latitude: center.mapLatitude,
          longitude: center.mapLongitude,
        }}
        onPress={() => onPress(gym)}
        pinColor="#7C3AED"
        tracksViewChanges={false}
      />
    );
  }

  return (
    <Marker
      identifier={center.id}
      coordinate={{
        latitude: center.mapLatitude,
        longitude: center.mapLongitude,
      }}
      onPress={() => onPress(gym)}
      zIndex={selected ? 999 : center.friendsActiveCount > 0 ? 50 : 1}
      tracksViewChanges={tracksViewChanges}
      anchor={{x: 0.5, y: 0.5}}>
      <MapGymMarkerView center={center} selected={selected} />
    </Marker>
  );
});

export default MapGymLogoMarker;
