import http from 'node:http';
import type { IrSdkBridge, Session, Telemetry } from '@irdashies/types';
import { OverlayManager } from '../overlayManager';
import logger from '../logger';
import type {
  QuietEyeConfig,
  QuietEyeBridge,
  LapEvent,
  LapType,
  SessionType,
  CoachingResponse,
  SectionEvent,
  SectionFeedback,
  SectionBoundary,
  ServiceStatus,
} from './quietEyeBridge.types';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_PREFIX = '[QuietEyeBridge]';
const MAX_BUFFER_SAMPLES = 6000; // ~4 minutes at 25Hz
const HEALTH_CHECK_INTERVAL_MS = 10_000;
const SERVICE_TIMEOUT_MS = 5_000;

// ─── Circular Buffer ─────────────────────────────────────────────────────────

interface TelemetrySample {
  speed: number;
  brake: number;
  throttle: number;
  steering: number;
  lapDistPct: number;
  gear: number;
  absActive: boolean;
}

class CircularTelemetryBuffer {
  private buffer: TelemetrySample[];
  private writeIndex = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(sample: TelemetrySample): void {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * Snapshot buffer contents in insertion order, then clear.
   */
  drain(): TelemetrySample[] {
    if (this.count === 0) return [];

    const result: TelemetrySample[] = new Array(this.count);
    const start =
      this.count < this.capacity
        ? 0
        : this.writeIndex; // oldest item index

    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[(start + i) % this.capacity];
    }

    this.clear();
    return result;
  }

  /**
   * Extract a slice where lapDistPct is between [startPct, endPct).
   * Does NOT drain — caller reads from live buffer.
   */
  sliceByDistPct(startPct: number, endPct: number): TelemetrySample[] {
    const result: TelemetrySample[] = [];
    const readStart =
      this.count < this.capacity ? 0 : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const sample = this.buffer[(readStart + i) % this.capacity];
      if (sample.lapDistPct >= startPct && sample.lapDistPct < endPct) {
        result.push(sample);
      }
    }
    return result;
  }

  clear(): void {
    this.writeIndex = 0;
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }
}

// ─── HTTP Helpers (Node built-in) ────────────────────────────────────────────

function httpRequest(
  url: string,
  method: 'GET' | 'POST',
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      timeout: SERVICE_TIMEOUT_MS,
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        : undefined,
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP request timed out: ${method} ${url}`));
    });
    req.on('error', reject);

    if (body) req.write(body);
    req.end();
  });
}

async function postJson<T>(url: string, payload: unknown): Promise<T | null> {
  try {
    const res = await httpRequest(url, 'POST', JSON.stringify(payload));
    if (res.status >= 200 && res.status < 300) {
      return JSON.parse(res.body) as T;
    }
    logger.warn(`${LOG_PREFIX} POST ${url} returned ${res.status}: ${res.body.slice(0, 200)}`);
    return null;
  } catch (err) {
    logger.debug(`${LOG_PREFIX} POST ${url} failed: ${(err as Error).message}`);
    return null;
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await httpRequest(url, 'GET');
    if (res.status >= 200 && res.status < 300) {
      return JSON.parse(res.body) as T;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Track ID Resolution ─────────────────────────────────────────────────────

function resolveTrackId(session: Session): string {
  const info = session.WeekendInfo;
  const name = info.TrackName ?? '';
  const config = info.TrackConfigName ?? '';

  // Normalize: lowercase, replace spaces/dashes with underscore, strip non-alnum
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

  const base = normalize(name);
  const cfg = normalize(config);

  return cfg ? `${base}_${cfg}` : base;
}

// ─── Session Type Mapping ────────────────────────────────────────────────────

function resolveSessionType(session: Session): SessionType {
  const sessions = session.SessionInfo?.Sessions ?? [];
  // Find the active session (last one, or use SessionNum from telemetry)
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

// ─── Main Setup ──────────────────────────────────────────────────────────────

export async function setupQuietEyeBridge(
  overlayManager: OverlayManager,
  irsdkBridge: IrSdkBridge,
  config: QuietEyeConfig
): Promise<QuietEyeBridge> {
  const serviceUrl = config.serviceUrl || 'http://localhost:8878';

  logger.info(`${LOG_PREFIX} Initializing (service: ${serviceUrl}, sections: ${config.enableSectionFeedback})`);

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
  let serviceAvailable = false;
  let sectionBoundaries: SectionBoundary[] = [];
  let lastSectionIndex = -1;
  let stopped = false;

  // Callbacks
  const coachingCallbacks = new Set<(r: CoachingResponse) => void>();
  const sectionCallbacks = new Set<(f: SectionFeedback) => void>();

  // ─── Service Health Check ────────────────────────────────────────────────

  async function checkService(): Promise<void> {
    const status = await getJson<ServiceStatus>(`${serviceUrl}/api/status`);
    const wasAvailable = serviceAvailable;
    serviceAvailable = status?.status === 'ok' || status !== null;

    if (serviceAvailable && !wasAvailable) {
      logger.info(`${LOG_PREFIX} Service connected`);
    } else if (!serviceAvailable && wasAvailable) {
      logger.warn(`${LOG_PREFIX} Service unavailable`);
    }

    // Load section boundaries if available
    if (serviceAvailable && status?.sections) {
      sectionBoundaries = status.sections;
    }
  }

  const healthInterval = setInterval(() => {
    if (!stopped) checkService();
  }, HEALTH_CHECK_INTERVAL_MS);

  // Initial check
  await checkService();

  // ─── Session Data Handler ────────────────────────────────────────────────

  function handleSessionData(session: Session): void {
    const newTrackId = resolveTrackId(session);
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
      sectionBoundaries = [];
      lastSectionIndex = -1;

      // Re-fetch section boundaries for the new track
      checkService();
    }

    currentSession = session;
    currentSessionType = resolveSessionType(session);
  }

  // ─── Telemetry Handler ───────────────────────────────────────────────────

  async function handleTelemetry(telemetry: Telemetry): Promise<void> {
    if (!serviceAvailable) return;

    // Extract player values (index 0 for arrays, raw for scalars)
    const speed = telemetry.Speed?.value?.[0] ?? 0;
    const brake = telemetry.Brake?.value?.[0] ?? 0;
    const throttle = telemetry.Throttle?.value?.[0] ?? 0;
    const steering = telemetry.SteeringWheelAngle?.value?.[0] ?? 0;
    const lapDistPct = telemetry.CarIdxLapDistPct?.value?.[0] ?? 0;
    const gear = telemetry.Gear?.value?.[0] ?? 0;
    const absActive = telemetry.BrakeABSactive?.value?.[0] ?? false;
    const lapNumber = telemetry.Lap?.value?.[0] ?? 0;
    const lapTime = telemetry.LapCurrentLapTime?.value?.[0] ?? 0;
    const lastLapTime = telemetry.LapLastLapTime?.value?.[0] ?? 0;
    const onPitRoad = telemetry.OnPitRoad?.value?.[0] ?? false;
    const incidents = telemetry.PlayerCarMyIncidentCount?.value?.[0] ?? 0;
    const sessionNum = telemetry.SessionNum?.value?.[0] ?? 0;

    // Resolve session type from active session number
    if (currentSession) {
      currentSessionType = resolveSessionTypeFromNum(currentSession, sessionNum);
    }

    // Buffer telemetry sample
    telemetryBuffer.push({
      speed,
      brake,
      throttle,
      steering,
      lapDistPct,
      gear,
      absActive,
    });

    // ─── Lap Completion Detection ──────────────────────────────────────────

    if (lapNumber > 0 && lapNumber !== currentLapNumber && currentLapNumber > 0) {
      // Lap completed — the buffer contains the completed lap data
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
      const conditions = currentSession
        ? {
            track_temp: telemetry.TrackTemp?.value?.[0] ?? 0,
            track_wetness: telemetry.TrackWetness?.value?.[0] ?? 0,
            air_temp: telemetry.AirTemp?.value?.[0] ?? 0,
            precipitation: telemetry.Precipitation?.value?.[0] ?? 0,
          }
        : undefined;

      // Build LapEvent
      const lapEvent: LapEvent = {
        track_id: currentTrackId,
        session_id: currentSessionId,
        lap_number: completedLapNumber,
        lap_time: completedLapTime,
        lap_type: lapType,
        delta_best: deltaBest,
        delta_prev: deltaPrev,
        incidents: lapIncidents,
        session_type: currentSessionType,
        conditions,
      };

      // Update state for next lap
      previousLapTime = completedLapTime;
      lapStartIncidents = incidents;

      // Send to service (fire and forget, don't block telemetry loop)
      sendLapEvent(lapEvent, samples);
    }

    // Track lap number transitions
    if (lapNumber > 0 && currentLapNumber !== lapNumber) {
      if (currentLapNumber === -1) {
        // First telemetry frame — initialize
        lapStartIncidents = incidents;
      }
      currentLapNumber = lapNumber;
      lastSectionIndex = -1; // Reset section tracking for new lap
    }

    // Track pit road state
    wasOnPitRoad = onPitRoad;
    lastIncidents = incidents;

    // ─── Section Boundary Detection ────────────────────────────────────────

    if (config.enableSectionFeedback && sectionBoundaries.length > 0) {
      checkSectionBoundary(lapDistPct, lapNumber);
    }
  }

  // ─── Send Lap Event ──────────────────────────────────────────────────────

  async function sendLapEvent(event: LapEvent, samples: TelemetrySample[]): Promise<void> {
    logger.info(
      `${LOG_PREFIX} Lap ${event.lap_number} complete: ${event.lap_time.toFixed(3)}s ` +
      `(type=${event.lap_type}, delta_best=${event.delta_best.toFixed(3)}s)`
    );

    // We don't include telemetry in the POST body (schema uses telemetry_file for large data)
    // The Quiet Eye service works with the numeric summary in the LapEvent
    const response = await postJson<CoachingResponse>(`${serviceUrl}/api/lap`, event);

    if (response) {
      logger.info(
        `${LOG_PREFIX} Coaching: "${response.radio_message.slice(0, 60)}..." (behavior=${response.behavior})`
      );

      // Publish to overlays
      overlayManager.publishMessage('quietEye:coaching', response);

      // Notify registered callbacks
      coachingCallbacks.forEach((cb) => cb(response));
    }
  }

  // ─── Section Boundary Check ──────────────────────────────────────────────

  function checkSectionBoundary(lapDistPct: number, lapNumber: number): void {
    // Find which section we're currently in
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
        const sectionEvent: SectionEvent = {
          track_id: currentTrackId,
          session_id: currentSessionId,
          lap_number: lapNumber,
          section_id: completedSection.section_id,
          telemetry_slice: {
            speed: sectionSamples.map((s) => s.speed),
            brake: sectionSamples.map((s) => s.brake),
            throttle: sectionSamples.map((s) => s.throttle),
            steering: sectionSamples.map((s) => s.steering),
            lap_dist_pct: sectionSamples.map((s) => s.lapDistPct),
          },
        };

        sendSectionEvent(sectionEvent);
      }
    }

    lastSectionIndex = currentSectionIdx;
  }

  async function sendSectionEvent(event: SectionEvent): Promise<void> {
    const feedback = await postJson<SectionFeedback>(`${serviceUrl}/api/section`, event);

    if (feedback) {
      logger.debug(`${LOG_PREFIX} Section ${feedback.section_id}: ${feedback.message}`);

      // Publish to overlays
      overlayManager.publishMessage('quietEye:sectionFeedback', feedback);

      // Notify registered callbacks
      sectionCallbacks.forEach((cb) => cb(feedback));
    }
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
    onCoachingResponse: (callback: (response: CoachingResponse) => void) => {
      coachingCallbacks.add(callback);
      return () => {
        coachingCallbacks.delete(callback);
      };
    },
    onSectionFeedback: (callback: (feedback: SectionFeedback) => void) => {
      sectionCallbacks.add(callback);
      return () => {
        sectionCallbacks.delete(callback);
      };
    },
    stop: () => {
      stopped = true;
      clearInterval(healthInterval);
      unsubTelemetry?.();
      unsubSession?.();
      coachingCallbacks.clear();
      sectionCallbacks.clear();
      telemetryBuffer.clear();
      logger.info(`${LOG_PREFIX} Stopped`);
    },
  };
}
