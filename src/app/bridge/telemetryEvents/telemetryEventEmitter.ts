/**
 * Generic Telemetry Event Emitter.
 *
 * Subscribes to the iRacing SDK bridge, manages telemetry buffering,
 * and emits high-level racing events (lap complete, pit exit, section crossing,
 * session change) to registered callbacks.
 *
 * Enriched with full iRacing data: race context, car state, tire data,
 * expanded conditions, and session info. Consumers choose what to use.
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
  RaceContext,
  CarState,
  TireData,
  Conditions,
  SessionInfoSnapshot,
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

// ─── Helper: Parse incident limit from session info ──────────────────────────

function parseIncidentLimit(session: Session): number {
  const raw = session.WeekendInfo?.WeekendOptions?.IncidentLimit;
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// ─── Helper: Calculate gap to nearest car ahead/behind in same class ─────────

function calculateGaps(
  telemetry: Telemetry,
  playerIdx: number,
  playerClassId: number
): { gapAhead: number; gapBehind: number; aheadLastLap: number; behindLastLap: number } {
  const estTimes = telemetry.CarIdxEstTime?.value ?? [];
  const classIds = telemetry.CarIdxClass?.value ?? [];
  const positions = telemetry.CarIdxClassPosition?.value ?? [];
  const lastLapTimes = telemetry.CarIdxLastLapTime?.value ?? [];

  const playerEstTime = estTimes[playerIdx] ?? 0;
  const playerClassPos = positions[playerIdx] ?? 0;

  if (playerEstTime <= 0 || playerClassPos <= 0) {
    return { gapAhead: 0, gapBehind: 0, aheadLastLap: 0, behindLastLap: 0 };
  }

  let gapAhead = 0;
  let gapBehind = 0;
  let aheadLastLap = 0;
  let behindLastLap = 0;

  // Find car immediately ahead (classPosition = playerClassPos - 1)
  // and car immediately behind (classPosition = playerClassPos + 1) in same class
  for (let i = 0; i < classIds.length; i++) {
    if (i === playerIdx) continue;
    if (classIds[i] !== playerClassId) continue;

    const otherPos = positions[i] ?? 0;
    const otherEstTime = estTimes[i] ?? 0;
    if (otherPos <= 0 || otherEstTime <= 0) continue;

    if (otherPos === playerClassPos - 1) {
      // Car ahead
      gapAhead = playerEstTime - otherEstTime;
      const lapTime = lastLapTimes[i] ?? 0;
      aheadLastLap = lapTime > 0 ? lapTime : 0;
    } else if (otherPos === playerClassPos + 1) {
      // Car behind
      gapBehind = otherEstTime - playerEstTime;
      const lapTime = lastLapTimes[i] ?? 0;
      behindLastLap = lapTime > 0 ? lapTime : 0;
    }
  }

  return { gapAhead, gapBehind, aheadLastLap, behindLastLap };
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

  // Fuel tracking
  let fuelAtLapStart = 0;

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
      fuelAtLapStart = 0;
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

  // ─── Extract Race Context ────────────────────────────────────────────────

  function extractRaceContext(telemetry: Telemetry, session: Session | null): RaceContext | undefined {
    const playerIdx = telemetry.PlayerCarIdx?.value?.[0] ?? 0;
    const positions = telemetry.CarIdxPosition?.value ?? [];
    const classPositions = telemetry.CarIdxClassPosition?.value ?? [];
    const classIds = telemetry.CarIdxClass?.value ?? [];

    const position = positions[playerIdx] ?? 0;
    const classPosition = classPositions[playerIdx] ?? 0;
    const playerClassId = classIds[playerIdx] ?? 0;

    // Count active cars
    let totalCars = 0;
    let totalCarsInClass = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] > 0) {
        totalCars++;
        if (classIds[i] === playerClassId) {
          totalCarsInClass++;
        }
      }
    }

    // Gaps
    const { gapAhead, gapBehind, aheadLastLap, behindLastLap } = calculateGaps(telemetry, playerIdx, playerClassId);

    // Session time/laps remaining
    const lapsRemaining = telemetry.SessionLapsRemainEx?.value?.[0] ?? 0;
    const timeRemaining = telemetry.SessionTimeRemain?.value?.[0] ?? 0;

    // Race duration estimate
    const sessionTimeTotal = telemetry.SessionTimeTotal?.value?.[0] ?? 0;
    const raceDurationMinutes = sessionTimeTotal > 0 ? sessionTimeTotal / 60 : 0;

    // Pit stops remaining (estimate from fuel data)
    const fuelLevel = telemetry.FuelLevel?.value?.[0] ?? 0;
    const fuelUsePerHour = telemetry.FuelUsePerHour?.value?.[0] ?? 0;
    let pitStopsRemaining = 0;
    if (fuelUsePerHour > 0 && timeRemaining > 0) {
      const fuelNeeded = (fuelUsePerHour / 3600) * timeRemaining;
      const maxFuel = session?.DriverInfo?.DriverCarFuelMaxLtr ?? 0;
      if (maxFuel > 0) {
        const totalFuelNeeded = Math.max(0, fuelNeeded - fuelLevel);
        pitStopsRemaining = Math.ceil(totalFuelNeeded / maxFuel);
      }
    }

    // Incidents
    const incidents = telemetry.PlayerCarMyIncidentCount?.value?.[0] ?? 0;
    const incidentLimit = session ? parseIncidentLimit(session) : 0;

    // Safety car detection (PaceMode > 0 or CarIdxPaceLine has active entries)
    const paceMode = telemetry.PaceMode?.value?.[0] ?? 0;
    const safetyCarOut = paceMode > 0;

    return {
      position,
      classPosition,
      totalCars,
      totalCarsInClass,
      gapAhead,
      gapBehind,
      aheadLastLap,
      behindLastLap,
      lapsRemaining,
      timeRemaining,
      raceDurationMinutes,
      pitStopsRemaining,
      incidents,
      incidentLimit,
      safetyCarOut,
    };
  }

  // ─── Extract Car State ───────────────────────────────────────────────────

  function extractCarState(telemetry: Telemetry, fuelUsedLastLap: number): CarState {
    return {
      fuelLevel: telemetry.FuelLevel?.value?.[0] ?? 0,
      fuelUsedLastLap,
      fuelPressure: telemetry.FuelPress?.value?.[0] ?? 0,
      oilTemp: telemetry.OilTemp?.value?.[0] ?? 0,
      oilPressure: telemetry.OilPress?.value?.[0] ?? 0,
      waterTemp: telemetry.WaterTemp?.value?.[0] ?? 0,
      voltage: telemetry.Voltage?.value?.[0] ?? 0,
      engineRPM: telemetry.RPM?.value?.[0] ?? 0,
      brakeBias: telemetry.dcBrakeBias?.value?.[0] ?? 0,
      tireCompound: telemetry.PlayerTireCompound?.value?.[0] ?? 0,
    };
  }

  // ─── Extract Tire Data ───────────────────────────────────────────────────

  function extractTireData(telemetry: Telemetry): TireData {
    return {
      lfTemp: [
        telemetry.LFtempCL?.value?.[0] ?? 0,
        telemetry.LFtempCM?.value?.[0] ?? 0,
        telemetry.LFtempCR?.value?.[0] ?? 0,
      ],
      rfTemp: [
        telemetry.RFtempCL?.value?.[0] ?? 0,
        telemetry.RFtempCM?.value?.[0] ?? 0,
        telemetry.RFtempCR?.value?.[0] ?? 0,
      ],
      lrTemp: [
        telemetry.LRtempCL?.value?.[0] ?? 0,
        telemetry.LRtempCM?.value?.[0] ?? 0,
        telemetry.LRtempCR?.value?.[0] ?? 0,
      ],
      rrTemp: [
        telemetry.RRtempCL?.value?.[0] ?? 0,
        telemetry.RRtempCM?.value?.[0] ?? 0,
        telemetry.RRtempCR?.value?.[0] ?? 0,
      ],
      lfWear: [
        telemetry.LFwearL?.value?.[0] ?? 0,
        telemetry.LFwearM?.value?.[0] ?? 0,
        telemetry.LFwearR?.value?.[0] ?? 0,
      ],
      rfWear: [
        telemetry.RFwearL?.value?.[0] ?? 0,
        telemetry.RFwearM?.value?.[0] ?? 0,
        telemetry.RFwearR?.value?.[0] ?? 0,
      ],
      lrWear: [
        telemetry.LRwearL?.value?.[0] ?? 0,
        telemetry.LRwearM?.value?.[0] ?? 0,
        telemetry.LRwearR?.value?.[0] ?? 0,
      ],
      rrWear: [
        telemetry.RRwearL?.value?.[0] ?? 0,
        telemetry.RRwearM?.value?.[0] ?? 0,
        telemetry.RRwearR?.value?.[0] ?? 0,
      ],
    };
  }

  // ─── Extract Conditions ──────────────────────────────────────────────────

  function extractConditions(telemetry: Telemetry, session: Session | null): Conditions {
    // Track usage from session info (parse from TrackSessionRubberState or estimate)
    let trackUsage = 0;
    if (session) {
      const sessions = session.SessionInfo?.Sessions ?? [];
      for (const s of sessions) {
        const rubberState = s.SessionTrackRubberState?.toLowerCase() ?? '';
        if (rubberState.includes('high')) trackUsage = 75;
        else if (rubberState.includes('moderate')) trackUsage = 50;
        else if (rubberState.includes('low')) trackUsage = 25;
        else if (rubberState.includes('clean')) trackUsage = 0;
      }
    }

    return {
      trackTemp: telemetry.TrackTempCrew?.value?.[0] ?? telemetry.TrackTemp?.value?.[0] ?? 0,
      airTemp: telemetry.AirTemp?.value?.[0] ?? 0,
      trackWetness: telemetry.TrackWetness?.value?.[0] ?? 0,
      precipitation: telemetry.Precipitation?.value?.[0] ?? 0,
      windSpeed: telemetry.WindVel?.value?.[0] ?? 0,
      windDirection: telemetry.WindDir?.value?.[0] ?? 0,
      humidity: telemetry.RelativeHumidity?.value?.[0] ?? 0,
      airDensity: telemetry.AirDensity?.value?.[0] ?? 0,
      airPressure: telemetry.AirPressure?.value?.[0] ?? 0,
      fogLevel: telemetry.FogLevel?.value?.[0] ?? 0,
      skies: telemetry.Skies?.value?.[0] ?? 0,
      trackUsage,
    };
  }

  // ─── Extract Session Info Snapshot ───────────────────────────────────────

  function extractSessionInfo(session: Session | null, sessionNum: number): SessionInfoSnapshot | undefined {
    if (!session) return undefined;

    const weekend = session.WeekendInfo;
    const sessions = session.SessionInfo?.Sessions ?? [];
    const activeSession = sessions[sessionNum];

    // Attempt to get SOF from results or driver info
    let strengthOfField = 0;
    const drivers = session.DriverInfo?.Drivers ?? [];
    if (drivers.length > 0) {
      const ratings = drivers
        .filter((d) => d.IRating > 0 && !d.CarIsPaceCar)
        .map((d) => d.IRating);
      if (ratings.length > 0) {
        strengthOfField = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
      }
    }

    return {
      seriesName: weekend.TrackDisplayName ?? weekend.TrackName ?? '',
      trackName: weekend.TrackName ?? '',
      trackConfig: weekend.TrackConfigName ?? '',
      trackLength: weekend.TrackLength ?? '',
      sessionType: activeSession?.SessionType ?? '',
      sessionSubType: activeSession?.SessionSubType ?? '',
      strengthOfField,
      maxIncidents: parseIncidentLimit(session),
    };
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

    // Expanded sample fields
    const rpm = telemetry.RPM?.value?.[0] ?? 0;
    const latAccel = telemetry.LatAccel?.value?.[0] ?? 0;
    const longAccel = telemetry.LongAccel?.value?.[0] ?? 0;
    const yawRate = telemetry.YawRate?.value?.[0] ?? 0;
    const tractionControl = telemetry.dcTractionControl?.value?.[0] ?? 0;
    const clutch = telemetry.Clutch?.value?.[0] ?? 0;
    const trackSurface = telemetry.PlayerTrackSurface?.value?.[0] ?? 0;

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
      rpm,
      latAccel,
      longAccel,
      yawRate,
      tractionControl,
      clutch,
      onPitRoad,
      trackSurface,
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

      // Fuel usage calculation
      const currentFuel = telemetry.FuelLevel?.value?.[0] ?? 0;
      const fuelUsedLastLap = fuelAtLapStart > 0 ? fuelAtLapStart - currentFuel : 0;

      // Drain buffer — this IS the completed lap's telemetry
      const samples = telemetryBuffer.drain();

      // Build enriched conditions
      const conditions = extractConditions(telemetry, currentSession);

      // Build race context
      const raceContext = extractRaceContext(telemetry, currentSession);

      // Build car state
      const carState = extractCarState(telemetry, Math.max(0, fuelUsedLastLap));

      // Build tire data
      const tireData = extractTireData(telemetry);

      // Build session info
      const sessionInfo = extractSessionInfo(currentSession, sessionNum);

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
        raceContext,
        carState,
        tireData,
        sessionInfo,
      };

      // Update state for next lap
      previousLapTime = completedLapTime;
      lapStartIncidents = incidents;
      fuelAtLapStart = currentFuel; // Record fuel level at start of new lap

      lapCompleteCallbacks.forEach((cb) => cb(event));
    }

    // Track lap number transitions
    if (lapNumber > 0 && currentLapNumber !== lapNumber) {
      if (currentLapNumber === -1) {
        lapStartIncidents = incidents;
        fuelAtLapStart = telemetry.FuelLevel?.value?.[0] ?? 0;
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
