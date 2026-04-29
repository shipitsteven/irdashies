import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import log from './app/logger';
import {
  iRacingSDKSetup,
  getCurrentBridge,
  onBridgeChanged,
} from './app/bridge/iracingSdk/setup';
import { getOrCreateDefaultDashboard } from './app/storage/dashboards';
import { setupTaskbar, KeybindingManager } from './app';
import {
  publishDashboardUpdates,
  dashboardBridge,
} from './app/bridge/dashboard/dashboardBridge';
import { setupPitLaneBridge } from './app/bridge/pitLaneBridge';
import { setupFuelCalculatorBridge } from './app/bridge/fuelCalculatorBridge';
import { OverlayManager } from './app/overlayManager';
import {
  startComponentServer,
  getComponentServerPort,
} from './app/webserver/componentServer';
import { updateElectronApp } from 'update-electron-app';
// @ts-expect-error no types for squirrel
import started from 'electron-squirrel-startup';
import { Analytics } from './app/analytics';
import { setupReferenceLapsBridge } from './app/bridge/referenceLapsBridge';
import { setupKeybindingsBridge } from './app/bridge/keybindingsBridge';
import { setupLogBridge } from './app/bridge/logBridge';
import { setupTelemetryEvents } from './app/bridge/telemetryEvents';
import { setupQuietEyeBridge, resolveTrackIdViaService } from './app/bridge/quietEyeBridge';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) app.quit();

updateElectronApp();

const overlayManager = new OverlayManager();
const analytics = new Analytics();
analytics.setupLogTransport();

overlayManager.setupHardwareAcceleration();
overlayManager.setupSingleInstanceLock();
overlayManager.setupAutoStart();

app.on('ready', async () => {
  // Don't start services if we don't have the single instance lock
  // (this instance should be quitting)
  if (!overlayManager.hasLock()) {
    return;
  }

  await iRacingSDKSetup(overlayManager);

  const dashboard = getOrCreateDefaultDashboard();
  const bridge = getCurrentBridge();

  // Setup IPC bridges
  setupLogBridge();
  setupFuelCalculatorBridge();
  setupPitLaneBridge();
  setupReferenceLapsBridge();

  // Start component server for browser components
  await startComponentServer(bridge, dashboardBridge);

  ipcMain.handle('getComponentServerPort', () => getComponentServerPort());

  // Quiet Eye service token IPC — renderer uses this for authenticated API calls
  function findServiceTokenPath(): string {
    const candidates = [
      path.resolve(__dirname, '..', 'data', '.service_token'),
      path.join(process.env.HOME || process.env.USERPROFILE || '', 'iOS', 'quiet-eye', 'quiet-eye', 'data', '.service_token'),
      path.join(process.env.HOME || process.env.USERPROFILE || '', 'Documents', 'quiet-eye', 'data', '.service_token'),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch { /* skip */ }
    }
    return candidates[0];
  }
  const serviceTokenPath = findServiceTokenPath();
  ipcMain.handle('quietEye:getServiceToken', () => {
    try {
      return fs.readFileSync(serviceTokenPath, 'utf8').trim();
    } catch {
      return null;
    }
  });

  overlayManager.createOverlays(dashboard);

  const keybindingManager = new KeybindingManager(overlayManager);
  keybindingManager.registerAll();

  setupTaskbar(overlayManager, keybindingManager);
  publishDashboardUpdates(overlayManager, analytics);
  setupKeybindingsBridge(keybindingManager);

  // Quiet Eye coaching bridge — non-critical, guarded
  const quietEyeServiceUrl = 'http://localhost:8878';
  const coachingWidget = dashboard?.widgets.find((w) => w.id === 'coaching');
  const coachingEnabled = coachingWidget?.enabled ?? false;
  try {
    if (bridge && coachingEnabled) {
      // Initialize generic telemetry event system
      const telemetryEvents = setupTelemetryEvents(bridge, {
        resolveTrackId: (session) => resolveTrackIdViaService(session, quietEyeServiceUrl, (sections) => {
          // Push sections to overlay as soon as track resolves (before first lap)
          telemetryEvents.setSectionBoundaries(sections);
          const trackSections = sections.map((b) => ({
            section_id: b.section_id,
            name: (b as any).name || b.section_id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            start_pct: b.start_pct,
            end_pct: b.end_pct,
          }));
          overlayManager.publishMessage('quietEye:trackSections', trackSections);
        }),
      });

      // Initialize Quiet Eye as a consumer of telemetry events
      await setupQuietEyeBridge(overlayManager, telemetryEvents, {
        enabled: true,
        serviceUrl: quietEyeServiceUrl,
        enableSectionFeedback: true,
      });

      // Re-wire when bridge changes (e.g. demo mode toggle)
      onBridgeChanged(async (newBridge) => {
        try {
          // Stop old event system and create new one for the new bridge
          telemetryEvents.stop();
          const newTelemetryEvents = setupTelemetryEvents(newBridge, {
            resolveTrackId: (session) => resolveTrackIdViaService(session, quietEyeServiceUrl, (sections) => {
              newTelemetryEvents.setSectionBoundaries(sections);
              const trackSections = sections.map((b) => ({
                section_id: b.section_id,
                name: (b as any).name || b.section_id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                start_pct: b.start_pct,
                end_pct: b.end_pct,
              }));
              overlayManager.publishMessage('quietEye:trackSections', trackSections);
            }),
          });
          await setupQuietEyeBridge(overlayManager, newTelemetryEvents, {
            enabled: true,
            serviceUrl: quietEyeServiceUrl,
            enableSectionFeedback: true,
          });
        } catch (err) {
          log.warn('Quiet Eye bridge re-init failed (non-fatal)', err);
        }
      });
    }
  } catch (err) {
    log.warn('Quiet Eye bridge init failed (non-fatal)', err);
  }

  await analytics.init(overlayManager.getVersion(), dashboard);

  // Check if settings window should start minimized
  const shouldStartMinimized =
    dashboard?.generalSettings?.startMinimized ?? false;
  if (shouldStartMinimized) {
    // Create the settings window but don't show it immediately
    const settingsWindow = overlayManager.createSettingsWindow();
    // Minimize it to system tray
    settingsWindow.hide();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('quit', () => {
  log.info('App quit');
  analytics.shutdown();
});

app.on('before-quit', () => {
  overlayManager.markQuitting();
});
