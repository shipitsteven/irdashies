import { useState } from 'react';
import { BaseSettingsSection } from '../components/BaseSettingsSection';
import type { CoachingOverlayConfig } from '@irdashies/types';
import { getWidgetDefaultConfig } from '@irdashies/types';
import { useDashboard } from '@irdashies/context';
import { SettingsSection } from '../components/SettingSection';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { SettingNumberRow } from '../components/SettingNumberRow';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SessionVisibility } from '../components/SessionVisibility';

const SETTING_ID = 'coaching';

const defaultConfig = getWidgetDefaultConfig('coaching');

interface CoachingWidgetSettings {
  id: string;
  enabled: boolean;
  config: CoachingOverlayConfig;
}

export const CoachingSettings = () => {
  const { currentDashboard } = useDashboard();

  const savedSettings = currentDashboard?.widgets.find(
    (w) => w.id === SETTING_ID
  ) as CoachingWidgetSettings | undefined;

  const [settings, setSettings] = useState<CoachingWidgetSettings>({
    id: SETTING_ID,
    enabled: savedSettings?.enabled ?? false,
    config:
      (savedSettings?.config as CoachingOverlayConfig) ?? defaultConfig,
  });

  if (!currentDashboard) return <>Loading...</>;

  return (
    <BaseSettingsSection
      title="Quiet Eye Coaching"
      description="AI-powered race coaching with per-lap feedback and section analysis. Requires the Quiet Eye service running on localhost:8878."
      settings={settings}
      onSettingsChange={(s) => setSettings(s as CoachingWidgetSettings)}
      widgetId={SETTING_ID}
    >
      {(handleConfigChange) => (
        <div className="space-y-4">
          <SettingsSection title="Display">
            <SettingToggleRow
              title="Show Radio Message"
              description="Display the AI radio-style coaching message after each lap"
              enabled={settings.config.showRadioMessage}
              onToggle={(v) => handleConfigChange({ showRadioMessage: v })}
            />

            <SettingNumberRow
              title="Radio Fade Duration (s)"
              description="How long the radio message stays visible before fading"
              value={settings.config.radioFadeDuration}
              min={3}
              max={30}
              step={1}
              onChange={(v) => handleConfigChange({ radioFadeDuration: v })}
            />

            <SettingToggleRow
              title="Show Action Items"
              description="Display prioritized coaching points below the radio message"
              enabled={settings.config.showActionItems}
              onToggle={(v) => handleConfigChange({ showActionItems: v })}
            />

            <SettingNumberRow
              title="Max Action Items"
              description="Maximum number of coaching items to display"
              value={settings.config.maxActionItems}
              min={1}
              max={10}
              step={1}
              onChange={(v) => handleConfigChange({ maxActionItems: v })}
            />

            <SettingToggleRow
              title="Show Status Indicator"
              description="Display service connection and processing status"
              enabled={settings.config.showStatusIndicator}
              onToggle={(v) => handleConfigChange({ showStatusIndicator: v })}
            />

            <SettingToggleRow
              title="Headless Mode"
              description="Run coaching service connection and TTS without showing any overlay. Use when you only want voice coaching."
              enabled={settings.config.headless}
              onToggle={(v) => handleConfigChange({ headless: v })}
            />
          </SettingsSection>

          <SettingsSection title="Appearance">
            <SettingNumberRow
              title="Font Size"
              description="Base font size for the overlay (px)"
              value={settings.config.fontSize}
              min={10}
              max={24}
              step={1}
              onChange={(v) => handleConfigChange({ fontSize: v })}
            />

            <SettingSliderRow
              title="Opacity"
              description="Background opacity of the overlay"
              value={Math.round(settings.config.opacity * 100)}
              units="%"
              min={20}
              max={100}
              step={5}
              onChange={(v) => handleConfigChange({ opacity: v / 100 })}
            />
          </SettingsSection>

          <SettingsSection title="Session Visibility">
            <SessionVisibility
              sessionVisibility={settings.config.sessionVisibility}
              handleConfigChange={handleConfigChange}
            />
          </SettingsSection>

          <SettingsSection title="Service Info">
            <div className="text-sm text-slate-400 space-y-1 px-1">
              <p>
                The Quiet Eye coaching service must be running at{' '}
                <code className="text-slate-300 bg-slate-700 px-1 rounded">
                  http://localhost:8878
                </code>
              </p>
              <p>
                irDashies will automatically connect when the service is
                available and reconnect if it goes down.
              </p>
            </div>
          </SettingsSection>
        </div>
      )}
    </BaseSettingsSection>
  );
};
