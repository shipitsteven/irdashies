/**
 * CoachingStore — Zustand store for Quiet Eye coaching state.
 *
 * Holds:
 * - Per-lap coaching responses (from LLM via adapter bridge)
 * - Per-section real-time feedback (rule-based)
 * - Service connection state
 * - Track section data for corner name overlay
 */

import { create } from 'zustand';
import type {
  CoachingResponse,
  SectionFeedback,
  TrackSection,
} from '@irdashies/types';

const MAX_COACHING_HISTORY = 5;
const MAX_SECTION_FEEDBACK_QUEUE = 10;

interface CoachingState {
  // Per-lap coaching (from LLM)
  latestCoaching: CoachingResponse | null;
  coachingHistory: CoachingResponse[];

  // Per-section feedback (rule-based, real-time)
  latestSectionFeedback: SectionFeedback | null;
  sectionFeedbackQueue: SectionFeedback[];

  // Track sections for corner name overlay
  trackSections: TrackSection[];

  // Service status
  serviceConnected: boolean;
  isProcessing: boolean;

  // Actions
  setCoaching: (response: CoachingResponse) => void;
  setSectionFeedback: (feedback: SectionFeedback) => void;
  setTrackSections: (sections: TrackSection[]) => void;
  setServiceConnected: (connected: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  clearCoaching: () => void;
}

export const useCoachingStore = create<CoachingState>((set) => ({
  latestCoaching: null,
  coachingHistory: [],
  latestSectionFeedback: null,
  sectionFeedbackQueue: [],
  trackSections: [],
  serviceConnected: false,
  isProcessing: false,

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

  setTrackSections: (sections) =>
    set({ trackSections: sections }),

  setServiceConnected: (connected) =>
    set({ serviceConnected: connected }),

  setIsProcessing: (processing) =>
    set({ isProcessing: processing }),

  clearCoaching: () =>
    set({
      latestCoaching: null,
      coachingHistory: [],
      latestSectionFeedback: null,
      sectionFeedbackQueue: [],
    }),
}));
