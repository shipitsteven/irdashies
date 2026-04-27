/**
 * Generic Telemetry Event Emitter.
 *
 * Subscribes to the iRacing SDK bridge, manages telemetry buffering,
 * and emits high-level racing events (lap complete, pit exit, section crossing,
 * session change) to registered callbacks.
 *
 * Has NO knowledge of Quiet Eye, HTTP, or any specific downstream service.
 */

import type { IrSdkBridge, Session, Telemetry } from '@irdashies/types';
import logger from '../../logger';
import { CircularTelemetryBuffer } from './circularBuffer';
import type {
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

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_PREFIX = '[TelemetryEvents]';
const MAX_BUFFER_SAMPLES = 6000; // ~4 minutes at 25Hz

// ─── Local Track ID Resolution (fallback) ────────────────────────────────────

function resolveTrackIdLocal(session: Session): string {
  const info = session.WeekendInfo;
  const name = info.TrackName ?? '';
  const config = info.TrackConfigName ?? '';

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

  const base = normalize(name);
  const cfg = normalize(config);

  return cfg ? `${base}_${cfg}` : base;
}

// ─── Session Type Resolution ─────────────────────────────────────────────────

function resolveSessionType(session: Session): SessionType {
  const sessions = session.SessionInfo?.Sessions ?? [];
  for (const s of sessions) {
    const t = s.SessionType?.toLowerCase() ?? '';
    if (t.includes('race')) return 'Race';
    if (t.includes('qual')) return 'Qualifying';
  }
  return 'Practice';
}

function resolveSessionTypeFromNum(session: Session, sessionNum: number): SessionType {
  const sessions = session.SessionInfo?.Sessions ?? [];
  const active = sessions[sessionNum];
  if (active) {
    const t = active.SessionType?.toLowerCase() ?? '';
    if (t.includes('race')) return 'Race';
    if (t.includes('qual')) return 'Qualifying';
  }
  return 'Practice';
}

// ─── Lap Type Classification ─────────────────────────────────────────────────

function classifyLap(
  onPitRoad: boolean,
  wasOnPitRoad: boolean,
  lapTime: number
): LapType {
  if (lapTime <= 0) return 'invalid';
  if (wasOnPitRoad) return 'out_lap';
  if (onPitRoad) return 'in_lap';
  return 'flying';
}

// ─── Setup Function ──────────────────────────────────────────────────────────

export function setupTelemetryEvents(
  irsdkBridge: IrSdkBridge,
  config: TelemetryEventConfig = {}
): TelemetryEventEmitter {
  logger.info(`${LOG_PREFIX} Initializing generic telemetry event system`);

  // State
  const telemetryBuffer = new CircularTelemetryBuffer(MAX_BUFFER_SAMPLES);
  let currentSession: Session | null = null;
  let currentTrackId = '';
  let currentSessionId = '';
  let currentSessionType: SessionType = 'Practice';
  let currentLapNumber = -1;
  let previousLapTime = 0;
  let bestLapTime = Infinity;
  let lastIncidents = 0;
  let lapStartIncidents = 0;
  let wasOnPitRoad = false;
  let sectionBoundaries: SectionBoundary[] = config.sectionBoundaries ?? [];
  let lastSectionIndex = -1;
  let stopped = false;

  // Track ID resolution cache
  let resolvedTrackIdCache: string | null = null;
  let lastWeekendInfoKey = '';

  // Callbacks
  const lapCompleteCallbacks = new Set<(event: LapCompleteEvent) => void>();
  const pitExitCallbacks = new Set<(event: PitExitEvent) => void>();
  const sectionCrossingCallbacks = new Set<(event: SectionCrossingEvent) => void>();
  const sessionChangeCallbacks = new Set<(event: SessionChangeEvent) => void>();

  // ─── Session Data Handler ────────────────────────────────────────────────

  async function handleSessionData(session: Session): Promise<void> {
    const weekendKey = `${session.WeekendInfo.TrackID}-${session.WeekendInfo.SubSessionID || session.WeekendInfo.SessionID}`;
    let newTrackId: string;

    if (weekendKey !== lastWeekendInfoKey) {
      lastWeekendInfoKey = weekendKey;
      if (config.resolveTrackId) {
        newTrackId = await config.resolveTrackId(session);
      } else {
        newTrackId = resolveTrackIdLocal(session);
      }
      resolvedTrackIdCache = newTrackId;
    } else {
      newTrackId = resolvedTrackIdCache || resolveTrackIdLocal(session);
    }

    const newSessionId = `${session.WeekendInfo.SubSessionID || session.WeekendInfo.SessionID}`;

    if (newSessionId !== currentSessionId || newTrackId !== currentTrackId) {
      logger.info(`${LOG_PREFIX} Session change: track=${newTrackId} session=${newSessionId}`);
      currentTrackId = newTrackId;
      currentSessionId = newSessionId;
      currentLapNumber = -1;
      previousLapTime = 0;
      bestLapTime = Infinity;
      lastIncidents = 0;
      lapStartIncidents = 0;
      telemetryBuffer.clear();
      lastSectionIndex = -1;

      currentSession = session;
      currentSessionType = resolveSessionType(session);

      // Emit session change event
      const event: SessionChangeEvent = {
        trackId: currentTrackId,
        sessionId: currentSessionId,
        sessionType: currentSessionType,
      };
      sessionChangeCallbacks.forEach((cb) => cb(event));
    } else {
      currentSession = session;
      currentSessionType = resolveSessionType(session);
    }
  }

  // ─── Telemetry Handler ───────────────────────────────────────────────────

  function handleTelemetry(telemetry: Telemetry): void {
    if (stopped) return;

    // Extract player values (index 0 for arrays, raw for scalars)
    const speed = telemetry.Speed?.value?.[0] ?? 0;
    const brake = telemetry.Brake?.value?.[0] ?? 0;
    const throttle = telemetry.Throttle?.value?.[0] ?? 0;
    const steering = telemetry.SteeringWheelAngle?.value?.[0] ?? 0;
    const lapDistPct = telemetry.CarIdxLapDistPct?.value?.[0] ?? 0;
    const gear = telemetry.Gear?.value?.[0] ?? 0;
    const absActive = telemetry.BrakeABSactive?.value?.[0] ?? false;
    const lapNumber = telemetry.Lap?.value?.[0] ?? 0;
    const lastLapTime = telemetry.LapLastLapTime?.value?.[0] ?? 0;
    const onPitRoad = telemetry.OnPitRoad?.value?.[0] ?? false;
    const incidents = telemetry.PlayerCarMyIncidentCount?.value?.[0] ?? 0;
    const sessionNum = telemetry.SessionNum?.value?.[0] ?? 0;

    // Resolve session type from active session number
    if (currentSession) {
      currentSessionType = resolveSessionTypeFromNum(currentSession, sessionNum);
    }

    // Buffer telemetry sample
    const sample: TelemetrySample = {
      speed,
      brake,
      throttle,
      steering,
      lapDistPct,
      gear,
      absActive,
    };
    telemetryBuffer.push(sample);

    // ─── Lap Completion Detection ──────────────────────────────────────────

    if (lapNumber > 0 && lapNumber !== currentLapNumber && currentLapNumber > 0) {
      const completedLapNumber = currentLapNumber;
      const completedLapTime = lastLapTime;

      // Calculate deltas
      const deltaBest = bestLapTime === Infinity ? 0 : completedLapTime - bestLapTime;
      const deltaPrev = previousLapTime > 0 ? completedLapTime - previousLapTime : 0;

      // Update best
      if (completedLapTime > 0 && completedLapTime < bestLapTime) {
        bestLapTime = completedLapTime;
      }

      // Incident delta for this lap
      const lapIncidents = incidents - lapStartIncidents;

      // Classify lap type
      const lapType = classifyLap(onPitRoad, wasOnPitRoad, completedLapTime);

      // Drain buffer — this IS the completed lap's telemetry
      const samples = telemetryBuffer.drain();

      // Build conditions from live telemetry
      const conditions = {
        trackTemp: telemetry.TrackTemp?.value?.[0] ?? 0,
        trackWetness: telemetry.TrackWetness?.value?.[0] ?? 0,
        airTemp: telemetry.AirTemp?.value?.[0] ?? 0,
        precipitation: telemetry.Precipitation?.value?.[0] ?? 0,
      };

      // Emit lap complete event
      const event: LapCompleteEvent = {
        trackId: currentTrackId,
        sessionId: currentSessionId,
        lapNumber: completedLapNumber,
        lapTime: completedLapTime,
        lastLapTime,
        bestLapTime: bestLapTime === Infinity ? 0 : bestLapTime,
        deltaBest,
        deltaPrev,
        incidents: lapIncidents,
        lapType,
        sessionType: currentSessionType,
        conditions,
        telemetrySamples: samples,
      };

      // Update state for next lap
      previousLapTime = completedLapTime;
      lapStartIncidents = incidents;

      lapCompleteCallbacks.forEach((cb) => cb(event));
    }

    // Track lap number transitions
    if (lapNumber > 0 && currentLapNumber !== lapNumber) {
      if (currentLapNumber === -1) {
        lapStartIncidents = incidents;
      }
      currentLapNumber = lapNumber;
      lastSectionIndex = -1; // Reset section tracking for new lap
    }

    // ─── Pit Exit Detection ────────────────────────────────────────────────

    if (wasOnPitRoad && !onPitRoad && currentTrackId) {
      logger.info(`${LOG_PREFIX} Pit exit detected`);
      const event: PitExitEvent = {
        trackId: currentTrackId,
        sessionId: currentSessionId,
        lapNumber,
        sessionType: currentSessionType,
      };
      pitExitCallbacks.forEach((cb) => cb(event));
    }
    wasOnPitRoad = onPitRoad;
    lastIncidents = incidents;

    // ─── Section Boundary Detection ────────────────────────────────────────

    if (sectionBoundaries.length > 0) {
      checkSectionBoundary(lapDistPct, lapNumber);
    }
  }

  // ─── Section Boundary Check ──────────────────────────────────────────────

  function checkSectionBoundary(lapDistPct: number, lapNumber: number): void {
    let currentSectionIdx = -1;
    for (let i = 0; i < sectionBoundaries.length; i++) {
      const section = sectionBoundaries[i];
      if (lapDistPct >= section.start_pct && lapDistPct < section.end_pct) {
        currentSectionIdx = i;
        break;
      }
    }

    // Detect section transition
    if (
      currentSectionIdx !== lastSectionIndex &&
      lastSectionIndex >= 0 &&
      currentLapNumber > 0
    ) {
      const completedSection = sectionBoundaries[lastSectionIndex];

      // Extract telemetry slice for the completed section
      const sectionSamples = telemetryBuffer.sliceByDistPct(
        completedSection.start_pct,
        completedSection.end_pct
      );

      if (sectionSamples.length > 0) {
        const event: SectionCrossingEvent = {
          trackId: currentTrackId,
          sessionId: currentSessionId,
          lapNumber,
          sectionId: completedSection.section_id,
          sectionIndex: lastSectionIndex,
          telemetrySlice: sectionSamples,
        };
        sectionCrossingCallbacks.forEach((cb) => cb(event));
      }
    }

    lastSectionIndex = currentSectionIdx;
  }

  // ─── Subscribe to iRacing SDK Bridge ─────────────────────────────────────

  const unsubTelemetry = irsdkBridge.onTelemetry((telemetry) => {
    handleTelemetry(telemetry);
  });

  const unsubSession = irsdkBridge.onSessionData((session) => {
    handleSessionData(session);
  });

  logger.info(`${LOG_PREFIX} Subscribed to iRacing SDK bridge`);

  // ─── Public Interface ────────────────────────────────────────────────────

  return {
    onLapComplete: (callback) => {
      lapCompleteCallbacks.add(callback);
      return () => { lapCompleteCallbacks.delete(callback); };
    },
    onPitExit: (callback) => {
      pitExitCallbacks.add(callback);
      return () => { pitExitCallbacks.delete(callback); };
    },
    onSectionCrossing: (callback) => {
      sectionCrossingCallbacks.add(callback);
      return () => { sectionCrossingCallbacks.delete(callback); };
    },
    onSessionChange: (callback) => {
      sessionChangeCallbacks.add(callback);
      return () => { sessionChangeCallbacks.delete(callback); };
    },
    setSectionBoundaries: (boundaries) => {
      sectionBoundaries = boundaries;
      lastSectionIndex = -1;
      logger.info(`${LOG_PREFIX} Section boundaries updated (${boundaries.length} sections)`);
    },
    stop: () => {
      stopped = true;
      unsubTelemetry?.();
      unsubSession?.();
      lapCompleteCallbacks.clear();
      pitExitCallbacks.clear();
      sectionCrossingCallbacks.clear();
      sessionChangeCallbacks.clear();
      telemetryBuffer.clear();
      logger.info(`${LOG_PREFIX} Stopped`);
    },
  };
}
