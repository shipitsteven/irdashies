/**
 * Types for Quiet Eye coaching integration.
 * Derived from coaching_response.schema.json and section_feedback.schema.json.
 */

// === Coaching Response (per-lap, from LLM) ===

export interface CoachingLine {
  text: string;
  priority: number; // 1 = highest urgency, 5 = lowest
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
  section_losses: SectionLoss[];
  metadata: CoachingMetadata;
}

// === Section Feedback (per-section, real-time rule-based) ===

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

// === Track Section (for corner name overlay) ===

export interface TrackSection {
  section_id: string;
  name: string;
  subtitle?: string;
  corner_number?: string; // e.g. "T1", "T3"
  start_pct: number; // 0-1 lap distance
  end_pct: number; // 0-1 lap distance
}

// === Widget Config Types ===

export interface CoachingOverlayConfig {
  showRadioMessage: boolean;
  radioFadeDuration: number; // seconds
  showActionItems: boolean;
  maxActionItems: number;
  showStatusIndicator: boolean;
  fontSize: number;
  opacity: number;
}

export interface CornerNameOverlayConfig {
  showSubtitle: boolean;
  showCornerNumber: boolean;
  showProgressBar: boolean;
  fontSize: number;
  opacity: number;
}
