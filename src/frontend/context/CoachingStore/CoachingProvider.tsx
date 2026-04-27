/**
 * CoachingProvider — listens for coaching messages from the main process
 * (via Electron IPC / window.electronAPI) and updates the CoachingStore.
 *
 * Message channels:
 *   'coaching:response'       → CoachingResponse (per-lap coaching from LLM)
 *   'coaching:section'        → SectionFeedback (per-section real-time)
 *   'coaching:status'         → { connected: boolean, processing: boolean }
 *   'coaching:track-sections' → TrackSection[] (loaded on track change)
 */

import { useEffect } from 'react';
import { useCoachingStore } from './CoachingStore';
import type {
  CoachingResponse,
  SectionFeedback,
  TrackSection,
} from '@irdashies/types';

interface CoachingStatusMessage {
  connected: boolean;
  processing: boolean;
}

// The adapter bridge exposes these IPC channels on the window object.
// In production, this is wired via Electron's contextBridge preload.
// In Storybook, we skip this provider entirely and seed the store directly.
interface CoachingBridgeApi {
  onCoachingResponse?: (
    callback: (data: CoachingResponse) => void
  ) => (() => void) | undefined;
  onSectionFeedback?: (
    callback: (data: SectionFeedback) => void
  ) => (() => void) | undefined;
  onCoachingStatus?: (
    callback: (data: CoachingStatusMessage) => void
  ) => (() => void) | undefined;
  onTrackSections?: (
    callback: (data: TrackSection[]) => void
  ) => (() => void) | undefined;
}

declare global {
  interface Window {
    coachingBridge?: CoachingBridgeApi;
  }
}

export const CoachingProvider = () => {
  const setCoaching = useCoachingStore((s) => s.setCoaching);
  const setSectionFeedback = useCoachingStore((s) => s.setSectionFeedback);
  const setServiceConnected = useCoachingStore((s) => s.setServiceConnected);
  const setIsProcessing = useCoachingStore((s) => s.setIsProcessing);
  const setTrackSections = useCoachingStore((s) => s.setTrackSections);

  useEffect(() => {
    const bridge = window.coachingBridge;
    if (!bridge) return;

    const unsubs: ((() => void) | undefined)[] = [];

    if (bridge.onCoachingResponse) {
      unsubs.push(
        bridge.onCoachingResponse((data) => {
          setCoaching(data);
          setIsProcessing(false);
        })
      );
    }

    if (bridge.onSectionFeedback) {
      unsubs.push(bridge.onSectionFeedback(setSectionFeedback));
    }

    if (bridge.onCoachingStatus) {
      unsubs.push(
        bridge.onCoachingStatus((status) => {
          setServiceConnected(status.connected);
          setIsProcessing(status.processing);
        })
      );
    }

    if (bridge.onTrackSections) {
      unsubs.push(bridge.onTrackSections(setTrackSections));
    }

    return () => {
      unsubs.forEach((unsub) => unsub?.());
    };
  }, [
    setCoaching,
    setSectionFeedback,
    setServiceConnected,
    setIsProcessing,
    setTrackSections,
  ]);

  return <></>;
};
