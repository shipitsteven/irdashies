/**
 * Generic Telemetry Event System — Type definitions.
 * These types are reusable by any plugin/bridge, not Quiet Eye-specific.
 */

import type { Session } from '@irdashies/types';

// ─── Telemetry Sample ────────────────────────────────────────────────────────

export interface TelemetrySample {
  speed: number;
  brake: number;
  throttle: number;
  steering: number;
  lapDistPct: number;
  gear: number;
  absActive: boolean;
}

// ─── Section Boundary ────────────────────────────────────────────────────────

export interface SectionBoundary {
  section_id: string;
  start_pct: number;
  end_pct: number;
}

// ─── Session Type ────────────────────────────────────────────────────────────

export type SessionType = 'Practice' | 'Qualifying' | 'Race';

// ─── Lap Type ────────────────────────────────────────────────────────────────

export type LapType = 'flying' | 'out_lap' | 'in_lap' | 'invalid';

// ─── Events ──────────────────────────────────────────────────────────────────

export interface LapCompleteEvent {
  trackId: string;
  sessionId: string;
  lapNumber: number;
  lapTime: number;
  lastLapTime: number;
  bestLapTime: number;
  deltaBest: number;
  deltaPrev: number;
  incidents: number;
  lapType: LapType;
  sessionType: SessionType;
  conditions: {
    trackTemp: number;
    trackWetness: number;
    airTemp: number;
    precipitation: number;
  };
  telemetrySamples: TelemetrySample[];
}

export interface PitExitEvent {
  trackId: string;
  sessionId: string;
  lapNumber: number;
  sessionType: SessionType;
}

export interface SectionCrossingEvent {
  trackId: string;
  sessionId: string;
  lapNumber: number;
  sectionId: string;
  sectionIndex: number;
  telemetrySlice: TelemetrySample[];
}

export interface SessionChangeEvent {
  trackId: string;
  sessionId: string;
  sessionType: SessionType;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface TelemetryEventConfig {
  /** Optional async track ID resolver. Falls back to local normalization if not provided. */
  resolveTrackId?: (session: Session) => Promise<string>;
  /** Optional initial section boundaries for section crossing events. */
  sectionBoundaries?: SectionBoundary[];
}

// ─── Emitter Interface ───────────────────────────────────────────────────────

export interface TelemetryEventEmitter {
  onLapComplete: (callback: (event: LapCompleteEvent) => void) => () => void;
  onPitExit: (callback: (event: PitExitEvent) => void) => () => void;
  onSectionCrossing: (callback: (event: SectionCrossingEvent) => void) => () => void;
  onSessionChange: (callback: (event: SessionChangeEvent) => void) => () => void;
  setSectionBoundaries: (boundaries: SectionBoundary[]) => void;
  stop: () => void;
}
