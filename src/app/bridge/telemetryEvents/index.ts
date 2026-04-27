/**
 * Generic Telemetry Event System — Public API.
 */

export { setupTelemetryEvents } from './telemetryEventEmitter';
export { CircularTelemetryBuffer } from './circularBuffer';
export type {
  TelemetryEventConfig,
  TelemetryEventEmitter,
  TelemetrySample,
  SectionBoundary,
  SessionType,
  LapType,
  LapCompleteEvent,
  PitExitEvent,
  SectionCrossingEvent,
  SessionChangeEvent,
} from './types';
