import { useState } from 'react';
import { BaseSettingsSection } from '../components/BaseSettingsSection';
import type { CornerNameOverlayConfig } from '@irdashies/types';
import { getWidgetDefaultConfig } from '@irdashies/types';
import { useDashboard } from '@irdashies/context';
import { SettingsSection } from '../components/SettingSection';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { SettingNumberRow } from '../components/SettingNumberRow';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SessionVisibility } from '../components/SessionVisibility';

const SETTING_ID = 'cornername';

const defaultConfig = getWidgetDefaultConfig('cornername');

interface CornerNameWidgetSettings {
  id: string;
  enabled: boolean;
  config: CornerNameOverlayConfig;
}

export const CornerNameSettings = () => {
  const { currentDashboard } = useDashboard();

  const savedSettings = currentDashboard?.widgets.find(
    (w) => w.id === SETTING_ID
  ) as CornerNameWidgetSettings | undefined;

  const [settings, setSettings] = useState<CornerNameWidgetSettings>({
    id: SETTING_ID,
    enabled: savedSettings?.enabled ?? false,
    config:
      (savedSettings?.config as CornerNameOverlayConfig) ?? defaultConfig,
  });

  if (!currentDashboard) return <>Loading...</>;

  return (
    <BaseSettingsSection
      title="Corner Names"
      description="Displays the current track section name, corner number, and progress through the section. Works as a standalone widget — no coaching service required."
      settings={settings}
      onSettingsChange={(s) => setSettings(s as CornerNameWidgetSettings)}
      widgetId={SETTING_ID}
    >
      {(handleConfigChange) => (
        <div className="space-y-4">
          <SettingsSection title="Display">
            <SettingToggleRow
              title="Show Corner Number"
              description="Display the corner number badge (e.g. T1, T3)"
              enabled={settings.config.showCornerNumber}
              onToggle={(v) => handleConfigChange({ showCornerNumber: v })}
            />

            <SettingToggleRow
              title="Show Subtitle"
              description="Display section subtitle below the corner name"
              enabled={settings.config.showSubtitle}
              onToggle={(v) => handleConfigChange({ showSubtitle: v })}
            />

            <SettingToggleRow
              title="Show Progress Bar"
              description="Display progress through the current section"
              enabled={settings.config.showProgressBar}
              onToggle={(v) => handleConfigChange({ showProgressBar: v })}
            />

            <SettingToggleRow
              title="Show Track Percentage"
              description="Display overall track position percentage"
              enabled={settings.config.showTrackPct}
              onToggle={(v) => handleConfigChange({ showTrackPct: v })}
            />
          </SettingsSection>

          <SettingsSection title="Appearance">
            <SettingNumberRow
              title="Font Size"
              description="Base font size for corner names (px)"
              value={settings.config.fontSize}
              min={12}
              max={32}
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
        </div>
      )}
    </BaseSettingsSection>
  );
};
