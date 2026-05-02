import {create} from 'zustand';

/** UI: bruger tilsyneladende uden for centeret (geofence). */
type CheckInUIState = {
  showAwayZoneWarning: boolean;
  setShowAwayZoneWarning: (v: boolean) => void;
};

export const useCheckInUIStore = create<CheckInUIState>(set => ({
  showAwayZoneWarning: false,
  setShowAwayZoneWarning: v => set({showAwayZoneWarning: v}),
}));
