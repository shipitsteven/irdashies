/**
 * Quiet Eye Coaching Service — TypeScript type definitions.
 * These mirror the JSON schemas at /simcoach/schemas/*.schema.json.
 *
 * Generic telemetry types (TelemetrySample, SectionBoundary, SessionType, LapType)
 * live in ./telemetryEvents/types.ts. This file contains Quiet Eye-specific types only.
 */

import type { SectionBoundary, SessionType, LapType } from './telemetryEvents';

// Re-export for convenience
export type { SectionBoundary, SessionType, LapType };

// ─── Configuration ───────────────────────────────────────────────────────────

export interface QuietEyeConfig {
  enabled: boolean;
  serviceUrl: string; // default: http://localhost:8878
  enableSectionFeedback: boolean;
}

// ─── Lap Event (input to service) ───────────────────────────────────────────

export interface LapConditions {
  track_temp: number;
  track_wetness: number;
  air_temp: number;
  precipitation: number;
}

export interface LapTelemetry {
  speed: number[];
  brake: number[];
  throttle: number[];
  steering: number[];
  lap_dist_pct: number[];
  abs_active?: boolean[];
  gear?: number[];
}

export interface LapEvent {
  track_id: string;
  session_id: string;
  lap_number: number;
  lap_time: number;
  lap_type: LapType;
  delta_best: number;
  delta_prev: number;
  incidents: number;
  session_type: SessionType;
  conditions?: LapConditions;
}

// ─── Section Event (input to service) ────────────────────────────────────────

export interface TelemetrySlice {
  speed: number[];
  brake: number[];
  throttle: number[];
  steering: number[];
  lap_dist_pct: number[];
}

export interface SectionEvent {
  track_id: string;
  session_id: string;
  lap_number: number;
  section_id: string;
  telemetry_slice: TelemetrySlice;
}

// ─── Coaching Response (output from service) ─────────────────────────────────

export interface CoachingLine {
  text: string;
  priority: number;
}

export interface SectionLoss {
  section_id: string;
  loss_s: number;
  tags: string[];
}

export interface CoachingMetadata {
  is_pb: boolean;
  gap_to_alien: number;
  processing_time_ms: number;
}

export interface CoachingResponse {
  lap_number: number;
  radio_message: string;
  coaching_lines: CoachingLine[];
  behavior: string;
  section_losses?: SectionLoss[];
  metadata?: CoachingMetadata;
}

// ─── Section Feedback (output from service) ──────────────────────────────────

export type SectionTrend = 'improving' | 'stable' | 'declining';

export interface SectionFeedback {
  section_id: string;
  section_name: string;
  delta_alien_s: number;
  delta_prev_s: number;
  delta_best_s: number;
  tags: string[];
  is_pb: boolean;
  trend: SectionTrend;
  message: string;
}

// ─── Service Status Response ─────────────────────────────────────────────────

export interface ServiceStatus {
  status: string;
  track_id?: string;
  sections?: SectionBoundary[];
}

// ─── Bridge Interface ────────────────────────────────────────────────────────

export interface QuietEyeBridge {
  onCoachingResponse: (callback: (response: CoachingResponse) => void) => () => void;
  onSectionFeedback: (callback: (feedback: SectionFeedback) => void) => () => void;
  stop: () => void;
}
