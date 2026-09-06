/**
 * Map marker with gym logo — enables tracksViewChanges briefly so RN Maps
 * snapshots the logo, then disables for smooth pans.
 */
import React, {memo, useEffect, useState} from 'react';
import {Marker} from 'react-native-maps';
import MapGymMarkerView from '@/components/map/MapGymMarkerView';
import type {MapCenter} from '@/data/mapCentersData';
import type {DanishGym} from '@/data/danishGyms';

type Props = {
  center: MapCenter;
  gym: DanishGym;
  selected: boolean;
  onPress: (gym: DanishGym) => void;
  /** Bumps when the viewport marker set is replaced — forces a fresh snapshot. */
  visibilityEpoch?: number;
};

const LOGO_TRACK_MS = 1200;
const SELECT_TRACK_MS = 500;

const MapGymLogoMarker = memo(function MapGymLogoMarker({
  center,
  gym,
  selected,
  onPress,
  visibilityEpoch = 0,
}: Props) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const t = setTimeout(() => setTracksViewChanges(false), LOGO_TRACK_MS);
    return () => clearTimeout(t);
  }, [center.id, center.mapLatitude, center.mapLongitude, visibilityEpoch]);

  useEffect(() => {
    setTracksViewChanges(true);
    const t = setTimeout(() => setTracksViewChanges(false), SELECT_TRACK_MS);
    return () => clearTimeout(t);
  }, [selected]);

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
