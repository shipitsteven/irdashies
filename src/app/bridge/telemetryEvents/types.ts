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
  // Expanded performance channels
  rpm: number;
  latAccel: number;
  longAccel: number;
  yawRate: number;
  tractionControl: number;
  clutch: number;
  onPitRoad: boolean;
  trackSurface: number;
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

// ─── Race Context ────────────────────────────────────────────────────────────

export interface RaceContext {
  position: number;
  classPosition: number;
  totalCars: number;
  totalCarsInClass: number;
  gapAhead: number;
  gapBehind: number;
  aheadLastLap: number;
  behindLastLap: number;
  lapsRemaining: number;
  timeRemaining: number;
  raceDurationMinutes: number;
  pitStopsRemaining: number;
  incidents: number;
  incidentLimit: number;
  safetyCarOut: boolean;
  whiteFlag: boolean;
  fuelLevel: number;
  fuelPerLap: number;             // average consumption per lap
  fuelLapsRemaining: number;      // fuelLevel / fuelPerLap
}

// ─── Car State ───────────────────────────────────────────────────────────────

export interface CarState {
  fuelLevel: number;
  fuelUsedLastLap: number;
  fuelPressure: number;
  oilTemp: number;
  oilPressure: number;
  waterTemp: number;
  voltage: number;
  engineRPM: number;
  brakeBias: number;
  tireCompound: number;
}

// ─── Tire Data ───────────────────────────────────────────────────────────────

export interface TireData {
  lfTemp: [number, number, number];
  rfTemp: [number, number, number];
  lrTemp: [number, number, number];
  rrTemp: [number, number, number];
  lfWear: [number, number, number];
  rfWear: [number, number, number];
  lrWear: [number, number, number];
  rrWear: [number, number, number];
}

// ─── Conditions ──────────────────────────────────────────────────────────────

export interface Conditions {
  trackTemp: number;
  airTemp: number;
  trackWetness: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  airDensity: number;
  airPressure: number;
  fogLevel: number;
  skies: number;
  trackUsage: number;
}

// ─── Session Info Snapshot ───────────────────────────────────────────────────

export interface SessionInfoSnapshot {
  seriesName: string;
  trackName: string;
  trackConfig: string;
  trackLength: string;
  sessionType: string;
  sessionSubType: string;
  strengthOfField: number;
  maxIncidents: number;
}

// ─── Car Info ─────────────────────────────────────────────────────────────────────

export interface CarInfo {
  carId: number;
  carScreenName: string;
  carClassId: number;
  carClassShortName: string;
  carPath: string;
}

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
  conditions: Conditions;
  telemetrySamples: TelemetrySample[];
  // Enriched data (all optional for backward compat)
  raceContext?: RaceContext;
  carState?: CarState;
  tireData?: TireData;
  sessionInfo?: SessionInfoSnapshot;
  carInfo?: CarInfo;
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

export interface WhiteFlagEvent {
  trackId: string;
  sessionId: string;
  lapNumber: number;
  sessionType: SessionType;
}

export interface CheckeredFlagEvent {
  trackId: string;
  sessionId: string;
  lapNumber: number;
  sessionType: SessionType;
  finalPosition?: number;
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
  onWhiteFlag: (callback: (event: WhiteFlagEvent) => void) => () => void;
  onCheckeredFlag: (callback: (event: CheckeredFlagEvent) => void) => () => void;
  setSectionBoundaries: (boundaries: SectionBoundary[]) => void;
  stop: () => void;
}
