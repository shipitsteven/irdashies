import { useMemo } from 'react';
import { useTelemetryValueRounded } from '@irdashies/context';
import type { TrackSection } from '@irdashies/types';
import { useTrackSections } from './useTrackSections';

interface CurrentSectionResult {
  section: TrackSection | null;
  progress: number; // 0-1 within the current section
}

/**
 * Determines the current track section based on LapDistPct telemetry.
 * Returns the matched section and progress through it.
 */
export const useCurrentSection = (): CurrentSectionResult => {
  const trackSections = useTrackSections();
  // 3dp ≈ 5m on a 5km track — matches SectorDelta precision
  const lapDistPct = useTelemetryValueRounded('LapDistPct', 3) ?? 0;

  return useMemo(() => {
    if (trackSections.length === 0) {
      return { section: null, progress: 0 };
    }

    // Find the section containing the current lap distance
    const current = trackSections.find(
      (s) => lapDistPct >= s.start_pct && lapDistPct < s.end_pct
    );

    if (!current) {
      // Handle wrap-around (section spanning S/F line)
      const wrapping = trackSections.find(
        (s) =>
          s.end_pct < s.start_pct &&
          (lapDistPct >= s.start_pct || lapDistPct < s.end_pct)
      );
      if (wrapping) {
        const width =
          wrapping.end_pct < wrapping.start_pct
            ? 1 - wrapping.start_pct + wrapping.end_pct
            : wrapping.end_pct - wrapping.start_pct;
        const offset =
          lapDistPct >= wrapping.start_pct
            ? lapDistPct - wrapping.start_pct
            : 1 - wrapping.start_pct + lapDistPct;
        return { section: wrapping, progress: width > 0 ? offset / width : 0 };
      }
      return { section: null, progress: 0 };
    }

    const width = current.end_pct - current.start_pct;
    const offset = lapDistPct - current.start_pct;
    const progress = width > 0 ? Math.min(1, Math.max(0, offset / width)) : 0;

    return { section: current, progress };
  }, [trackSections, lapDistPct]);
};
