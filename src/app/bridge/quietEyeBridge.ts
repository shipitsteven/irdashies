import http from 'node:http';
import type { Session } from '@irdashies/types';
import { OverlayManager } from '../overlayManager';
import logger from '../logger';
import type {
  TelemetryEventEmitter,
  LapCompleteEvent,
  PitExitEvent,
  SectionCrossingEvent,
  SessionChangeEvent,
} from './telemetryEvents';
import type {
  QuietEyeConfig,
  QuietEyeBridge,
  LapEvent,
  CoachingResponse,
  SectionEvent,
  SectionFeedback,
  ServiceStatus,
} from './quietEyeBridge.types';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_PREFIX = '[QuietEyeBridge]';
const HEALTH_CHECK_INTERVAL_MS = 10_000;
const SERVICE_TIMEOUT_MS = 60_000; // LLM coaching calls can take 30-45s via Bedrock tunnel

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

// ─── Track ID Resolution via Service ─────────────────────────────────────────

function httpGet(url: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Resolve track ID via the Quiet Eye service, falling back to local normalization.
 */
export async function resolveTrackIdViaService(
  session: Session,
  serviceUrl: string
): Promise<string> {
  const info = session.WeekendInfo;
  const iracingTrackId = info.TrackID;

  if (iracingTrackId && iracingTrackId > 0) {
    try {
      const response = await httpGet(`${serviceUrl}/api/resolve-track/${iracingTrackId}`);
      if (response && response.track_id) {
        logger.info(`${LOG_PREFIX} Resolved TrackID ${iracingTrackId} -> ${response.track_id}`);
        return response.track_id as string;
      }
    } catch {
      // Fall through to local resolution
    }
  }

  // Fallback: local normalization
  const name = info.TrackName ?? '';
  const config = info.TrackConfigName ?? '';
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  const base = normalize(name);
  const cfg = normalize(config);
  return cfg ? `${base}_${cfg}` : base;
}

// ─── Main Setup ──────────────────────────────────────────────────────────────

export async function setupQuietEyeBridge(
  overlayManager: OverlayManager,
  telemetryEvents: TelemetryEventEmitter,
  config: QuietEyeConfig
): Promise<QuietEyeBridge> {
  const serviceUrl = config.serviceUrl || 'http://localhost:8878';

  logger.info(`${LOG_PREFIX} Initializing (service: ${serviceUrl}, sections: ${config.enableSectionFeedback})`);

  // State
  let serviceAvailable = false;
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

    // Publish expanded service status to renderer
    overlayManager.publishMessage('quietEye:serviceStatus', {
      connected: serviceAvailable,
      processing: false,
      lastError: null,
      trackLoaded: status?.track_id ?? null,
      alienLoaded: !!(status as unknown as Record<string, unknown>)?.alien_loaded,
      llmAvailable: !!(status as unknown as Record<string, unknown>)?.llm_available,
      activeFallback: ((status as unknown as Record<string, unknown>)?.active_fallback as string) ?? null,
    });

    // Load section boundaries if available
    if (serviceAvailable && status?.sections) {
      telemetryEvents.setSectionBoundaries(status.sections);

      // Convert to TrackSection format for the corner name overlay
      const trackSections = status.sections.map((b) => ({
        section_id: b.section_id,
        name: b.section_id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        start_pct: b.start_pct,
        end_pct: b.end_pct,
      }));
      overlayManager.publishMessage('quietEye:trackSections', trackSections);
    }
  }

  const healthInterval = setInterval(() => {
    if (!stopped) checkService();
  }, HEALTH_CHECK_INTERVAL_MS);

  // Initial check
  await checkService();

  // ─── Event Handlers ──────────────────────────────────────────────────────

  const unsubLap = telemetryEvents.onLapComplete(async (event: LapCompleteEvent) => {
    if (!serviceAvailable) return;

    // Map to LapEvent schema for the service
    const lapEvent: LapEvent = {
      track_id: event.trackId,
      session_id: event.sessionId,
      lap_number: event.lapNumber,
      lap_time: event.lapTime,
      lap_type: event.lapType,
      delta_best: event.deltaBest,
      delta_prev: event.deltaPrev,
      incidents: event.incidents,
      session_type: event.sessionType,
      conditions: event.conditions
        ? {
            track_temp: event.conditions.trackTemp,
            track_wetness: event.conditions.trackWetness,
            air_temp: event.conditions.airTemp,
            precipitation: event.conditions.precipitation,
            wind_speed: event.conditions.windSpeed,
            wind_direction: event.conditions.windDirection,
            humidity: event.conditions.humidity,
            air_density: event.conditions.airDensity,
            air_pressure: event.conditions.airPressure,
            fog_level: event.conditions.fogLevel,
            skies: event.conditions.skies,
            track_usage: event.conditions.trackUsage,
          }
        : undefined,
      race_context: event.raceContext
        ? {
            position: event.raceContext.position,
            class_position: event.raceContext.classPosition,
            total_cars: event.raceContext.totalCars,
            total_cars_in_class: event.raceContext.totalCarsInClass,
            gap_ahead: event.raceContext.gapAhead,
            gap_behind: event.raceContext.gapBehind,
            laps_remaining: event.raceContext.lapsRemaining,
            time_remaining: event.raceContext.timeRemaining,
            race_duration_minutes: event.raceContext.raceDurationMinutes,
            pit_stops_remaining: event.raceContext.pitStopsRemaining,
            incidents: event.raceContext.incidents,
            incident_limit: event.raceContext.incidentLimit,
            safety_car_out: event.raceContext.safetyCarOut,
          }
        : undefined,
      car_state: event.carState
        ? {
            fuel_level: event.carState.fuelLevel,
            fuel_used_last_lap: event.carState.fuelUsedLastLap,
            fuel_pressure: event.carState.fuelPressure,
            oil_temp: event.carState.oilTemp,
            oil_pressure: event.carState.oilPressure,
            water_temp: event.carState.waterTemp,
            voltage: event.carState.voltage,
            engine_rpm: event.carState.engineRPM,
            brake_bias: event.carState.brakeBias,
            tire_compound: event.carState.tireCompound,
          }
        : undefined,
      tire_data: event.tireData
        ? {
            lf_temp: event.tireData.lfTemp,
            rf_temp: event.tireData.rfTemp,
            lr_temp: event.tireData.lrTemp,
            rr_temp: event.tireData.rrTemp,
            lf_wear: event.tireData.lfWear,
            rf_wear: event.tireData.rfWear,
            lr_wear: event.tireData.lrWear,
            rr_wear: event.tireData.rrWear,
          }
        : undefined,
      session_info: event.sessionInfo
        ? {
            series_name: event.sessionInfo.seriesName,
            track_name: event.sessionInfo.trackName,
            track_config: event.sessionInfo.trackConfig,
            track_length: event.sessionInfo.trackLength,
            session_type: event.sessionInfo.sessionType,
            session_sub_type: event.sessionInfo.sessionSubType,
            strength_of_field: event.sessionInfo.strengthOfField,
            max_incidents: event.sessionInfo.maxIncidents,
          }
        : undefined,
    };

    logger.info(
      `${LOG_PREFIX} Lap ${event.lapNumber} complete: ${event.lapTime.toFixed(3)}s ` +
      `(type=${event.lapType}, delta_best=${event.deltaBest.toFixed(3)}s)`
    );

    // Send to service
    let response: CoachingResponse | null = null;
    let errorDetail = '';
    try {
      const res = await httpRequest(`${serviceUrl}/api/lap`, 'POST', JSON.stringify(lapEvent));
      if (res.status >= 200 && res.status < 300) {
        response = JSON.parse(res.body) as CoachingResponse;
      } else {
        errorDetail = `HTTP ${res.status}: ${res.body.slice(0, 200)}`;
      }
    } catch (err) {
      errorDetail = (err as Error).message;
    }

    if (response) {
      logger.info(
        `${LOG_PREFIX} Coaching: "${response.radio_message.slice(0, 60)}..." (behavior=${response.behavior})`
      );
      overlayManager.publishMessage('quietEye:coaching', response);

      // Update service status — LLM just responded successfully
      if (response.behavior !== 'error' && response.behavior !== 'fallback_analysis') {
        overlayManager.publishMessage('quietEye:serviceStatus', {
          connected: true,
          processing: false,
          lastError: null,
          trackLoaded: currentTrackId,
          alienLoaded: true,
          llmAvailable: true,
          activeFallback: null,
        });
      }

      // Publish notifications based on behavior
      if (response.behavior === 'error') {
        overlayManager.publishMessage('quietEye:notification', {
          level: 'error',
          message: response.radio_message,
          source: 'service',
        });
      } else if (response.behavior === 'fallback_analysis') {
        overlayManager.publishMessage('quietEye:notification', {
          level: 'warning',
          message: 'LLM unavailable — showing raw analysis',
          source: 'llm',
        });
      } else if (response.behavior === 'no_data') {
        overlayManager.publishMessage('quietEye:notification', {
          level: 'error',
          message: response.radio_message,
          source: 'track',
        });
      }
      // Normal behavior: no notification, coaching shows in overlay

      coachingCallbacks.forEach((cb) => cb(response));
    } else {
      const errorMsg = errorDetail || 'No response from service';
      // Update status — LLM/service failed
      overlayManager.publishMessage('quietEye:serviceStatus', {
        connected: serviceAvailable,
        processing: false,
        lastError: errorMsg,
        trackLoaded: currentTrackId,
        alienLoaded: true,
        llmAvailable: false,
        activeFallback: 'error',
      });
      const errorResponse: CoachingResponse = {
        lap_number: event.lapNumber,
        radio_message: `⚠️ Coaching error: ${errorMsg}`,
        coaching_lines: [{ text: errorMsg, priority: 0 }],
        behavior: 'error',
      };
      overlayManager.publishMessage('quietEye:coaching', errorResponse);
      overlayManager.publishMessage('quietEye:notification', {
        level: 'error',
        message: `Coaching error: ${errorMsg}`,
        source: 'service',
      });
      logger.warn(`${LOG_PREFIX} Lap ${event.lapNumber} error: ${errorMsg}`);
    }
  });

  const unsubPitExit = telemetryEvents.onPitExit(async (event: PitExitEvent) => {
    if (!serviceAvailable) return;

    logger.info(`${LOG_PREFIX} Pit exit detected — sending outlap event`);

    const outlapEvent: LapEvent = {
      track_id: event.trackId,
      session_id: event.sessionId,
      lap_number: event.lapNumber,
      lap_time: 0,
      lap_type: 'out_lap',
      delta_best: 0,
      delta_prev: 0,
      incidents: 0,
      session_type: event.sessionType,
    };

    // Send to service
    let response: CoachingResponse | null = null;
    let errorDetail = '';
    try {
      const res = await httpRequest(`${serviceUrl}/api/lap`, 'POST', JSON.stringify(outlapEvent));
      if (res.status >= 200 && res.status < 300) {
        response = JSON.parse(res.body) as CoachingResponse;
      } else {
        errorDetail = `HTTP ${res.status}: ${res.body.slice(0, 200)}`;
      }
    } catch (err) {
      errorDetail = (err as Error).message;
    }

    if (response) {
      logger.info(
        `${LOG_PREFIX} Outlap coaching: "${response.radio_message.slice(0, 60)}..." (behavior=${response.behavior})`
      );
      overlayManager.publishMessage('quietEye:coaching', response);

      // Publish notifications based on behavior
      if (response.behavior === 'error') {
        overlayManager.publishMessage('quietEye:notification', {
          level: 'error',
          message: response.radio_message,
          source: 'service',
        });
      } else if (response.behavior === 'fallback_analysis') {
        overlayManager.publishMessage('quietEye:notification', {
          level: 'warning',
          message: 'LLM unavailable — showing raw analysis',
          source: 'llm',
        });
      } else if (response.behavior === 'no_data') {
        overlayManager.publishMessage('quietEye:notification', {
          level: 'error',
          message: response.radio_message,
          source: 'track',
        });
      }

      coachingCallbacks.forEach((cb) => cb(response));
    } else {
      const errorMsg = errorDetail || 'No response from service';
      const errorResponse: CoachingResponse = {
        lap_number: event.lapNumber,
        radio_message: `⚠️ Coaching error: ${errorMsg}`,
        coaching_lines: [{ text: errorMsg, priority: 0 }],
        behavior: 'error',
      };
      overlayManager.publishMessage('quietEye:coaching', errorResponse);
      overlayManager.publishMessage('quietEye:notification', {
        level: 'error',
        message: `Coaching error: ${errorMsg}`,
        source: 'service',
      });
      logger.warn(`${LOG_PREFIX} Outlap error: ${errorMsg}`);
    }
  });

  const unsubSection = telemetryEvents.onSectionCrossing(async (event: SectionCrossingEvent) => {
    if (!serviceAvailable || !config.enableSectionFeedback) return;

    const sectionEvent: SectionEvent = {
      track_id: event.trackId,
      session_id: event.sessionId,
      lap_number: event.lapNumber,
      section_id: event.sectionId,
      telemetry_slice: {
        speed: event.telemetrySlice.map((s) => s.speed),
        brake: event.telemetrySlice.map((s) => s.brake),
        throttle: event.telemetrySlice.map((s) => s.throttle),
        steering: event.telemetrySlice.map((s) => s.steering),
        lap_dist_pct: event.telemetrySlice.map((s) => s.lapDistPct),
      },
    };

    const feedback = await postJson<SectionFeedback>(`${serviceUrl}/api/section`, sectionEvent);

    if (feedback) {
      logger.debug(`${LOG_PREFIX} Section ${feedback.section_id}: ${feedback.message}`);
      overlayManager.publishMessage('quietEye:sectionFeedback', feedback);
      sectionCallbacks.forEach((cb) => cb(feedback));
    }
  });

  const unsubSessionChange = telemetryEvents.onSessionChange(async (_event: SessionChangeEvent) => {
    // Re-check service and load section boundaries for the new track
    await checkService();
  });

  logger.info(`${LOG_PREFIX} Subscribed to telemetry event system`);

  // ─── Public Interface ────────────────────────────────────────────────────

  return {
    onCoachingResponse: (callback: (response: CoachingResponse) => void) => {
      coachingCallbacks.add(callback);
      return () => { coachingCallbacks.delete(callback); };
    },
    onSectionFeedback: (callback: (feedback: SectionFeedback) => void) => {
      sectionCallbacks.add(callback);
      return () => { sectionCallbacks.delete(callback); };
    },
    stop: () => {
      stopped = true;
      clearInterval(healthInterval);
      unsubLap();
      unsubPitExit();
      unsubSection();
      unsubSessionChange();
      coachingCallbacks.clear();
      sectionCallbacks.clear();
      logger.info(`${LOG_PREFIX} Stopped`);
    },
  };
}
