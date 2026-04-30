/**
 * CoachingProvider — listens for coaching messages from the main process
 * (via Electron IPC / window.electronAPI) and updates the CoachingStore.
 *
 * Message channels:
 *   'coaching:response'       → CoachingResponse (per-lap coaching from LLM)
 *   'coaching:section'        → SectionFeedback (per-section real-time)
 *   'coaching:status'         → ServiceStatus (expanded service status)
 *   'coaching:track-sections' → TrackSection[] (loaded on track change)
 *   'coaching:notification'   → ServiceNotification (error/warning/info/success)
 */

import { useEffect } from 'react';
import { useCoachingStore } from './CoachingStore';
import type {
  CoachingResponse,
  SectionFeedback,
  ServiceStatus,
  ServiceNotification,
  TrackSection,
} from '@irdashies/types';

// Legacy status message format (backward compat)
interface LegacyCoachingStatusMessage {
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
    callback: (data: LegacyCoachingStatusMessage | ServiceStatus) => void
  ) => (() => void) | undefined;
  onTrackSections?: (
    callback: (data: TrackSection[]) => void
  ) => (() => void) | undefined;
  onNotification?: (
    callback: (data: Omit<ServiceNotification, 'id' | 'timestamp'>) => void
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
  const setServiceStatus = useCoachingStore((s) => s.setServiceStatus);
  const setTrackSections = useCoachingStore((s) => s.setTrackSections);
  const addNotification = useCoachingStore((s) => s.addNotification);

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
          // Handle both legacy format and expanded ServiceStatus
          if ('trackLoaded' in status || 'llmAvailable' in status || 'activeFallback' in status) {
            // Expanded ServiceStatus
            setServiceStatus(status as Partial<ServiceStatus>);
          } else {
            // Legacy format: { connected, processing }
            setServiceConnected(status.connected);
            setIsProcessing(status.processing);
          }
        })
      );
    }

    if (bridge.onTrackSections) {
      unsubs.push(bridge.onTrackSections(setTrackSections));
    }

    if (bridge.onNotification) {
      unsubs.push(bridge.onNotification(addNotification));
    }

    return () => {
      unsubs.forEach((unsub) => unsub?.());
    };
  }, [
    setCoaching,
    setSectionFeedback,
    setServiceConnected,
    setIsProcessing,
    setServiceStatus,
    setTrackSections,
    addNotification,
  ]);

  return <></>;
};
