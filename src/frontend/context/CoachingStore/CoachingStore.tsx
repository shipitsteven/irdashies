/**
 * CoachingStore — Zustand store for Quiet Eye coaching state.
 *
 * Holds:
 * - Per-lap coaching responses (from LLM via adapter bridge)
 * - Per-section real-time feedback (rule-based)
 * - Service connection state (expanded)
 * - Track section data for corner name overlay
 * - Notification queue for surfacing errors/warnings/info
 */

import { create } from 'zustand';
import type {
  CoachingResponse,
  SectionFeedback,
  TrackSection,
  ServiceNotification,
  ServiceStatus,
} from '@irdashies/types';

const MAX_COACHING_HISTORY = 5;
const MAX_SECTION_FEEDBACK_QUEUE = 10;
const MAX_NOTIFICATIONS = 20;

let notificationCounter = 0;
function generateNotificationId(): string {
  return `notif_${Date.now()}_${++notificationCounter}`;
}

interface CoachingState {
  // Per-lap coaching (from LLM)
  latestCoaching: CoachingResponse | null;
  coachingHistory: CoachingResponse[];

  // Per-section feedback (rule-based, real-time)
  latestSectionFeedback: SectionFeedback | null;
  sectionFeedbackQueue: SectionFeedback[];

  // Track sections for corner name overlay
  trackSections: TrackSection[];

  // Service status (expanded)
  serviceStatus: ServiceStatus;

  // Legacy accessors (backward compat)
  serviceConnected: boolean;
  isProcessing: boolean;

  // Notification queue
  notifications: ServiceNotification[];

  // Actions
  setCoaching: (response: CoachingResponse) => void;
  setSectionFeedback: (feedback: SectionFeedback) => void;
  setTrackSections: (sections: TrackSection[]) => void;
  setServiceConnected: (connected: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  setServiceStatus: (status: Partial<ServiceStatus>) => void;
  addNotification: (
    notification: Omit<ServiceNotification, 'id' | 'timestamp'>
  ) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  clearNotificationsBySource: (source: string) => void;
  clearCoaching: () => void;
}

export const useCoachingStore = create<CoachingState>((set) => ({
  latestCoaching: null,
  coachingHistory: [],
  latestSectionFeedback: null,
  sectionFeedbackQueue: [],
  trackSections: [],
  serviceStatus: {
    connected: false,
    processing: false,
    lastError: null,
    trackLoaded: null,
    alienLoaded: false,
    llmAvailable: false,
    activeFallback: null,
  },
  serviceConnected: false,
  isProcessing: false,
  notifications: [],

  setCoaching: (response) =>
    set((state) => ({
      latestCoaching: response,
      coachingHistory: [response, ...state.coachingHistory].slice(
        0,
        MAX_COACHING_HISTORY
      ),
    })),

  setSectionFeedback: (feedback) =>
    set((state) => ({
      latestSectionFeedback: feedback,
      sectionFeedbackQueue: [feedback, ...state.sectionFeedbackQueue].slice(
        0,
        MAX_SECTION_FEEDBACK_QUEUE
      ),
    })),

  setTrackSections: (sections) => set({ trackSections: sections }),

  setServiceConnected: (connected) =>
    set((state) => ({
      serviceConnected: connected,
      serviceStatus: { ...state.serviceStatus, connected },
    })),

  setIsProcessing: (processing) =>
    set((state) => ({
      isProcessing: processing,
      serviceStatus: { ...state.serviceStatus, processing },
    })),

  setServiceStatus: (status) =>
    set((state) => ({
      serviceStatus: { ...state.serviceStatus, ...status },
      // Keep legacy fields in sync
      ...(status.connected !== undefined
        ? { serviceConnected: status.connected }
        : {}),
      ...(status.processing !== undefined
        ? { isProcessing: status.processing }
        : {}),
    })),

  addNotification: (notification) =>
    set((state) => {
      const newNotification: ServiceNotification = {
        ...notification,
        id: generateNotificationId(),
        timestamp: Date.now(),
      };
      return {
        notifications: [newNotification, ...state.notifications].slice(
          0,
          MAX_NOTIFICATIONS
        ),
      };
    }),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),

  clearNotificationsBySource: (source) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.source !== source),
    })),

  clearCoaching: () =>
    set({
      latestCoaching: null,
      coachingHistory: [],
      latestSectionFeedback: null,
      sectionFeedbackQueue: [],
    }),
}));
