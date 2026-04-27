import { useCoachingStore } from '@irdashies/context';
import type { TrackSection } from '@irdashies/types';

/**
 * Returns the loaded track sections from the coaching store.
 */
export const useTrackSections = (): TrackSection[] => {
  return useCoachingStore((s) => s.trackSections);
};
