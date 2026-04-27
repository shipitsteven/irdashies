import { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { CornerNameOverlay } from './CornerNameOverlay';
import { useCoachingStore, useTelemetryStore } from '@irdashies/context';
import { TelemetryDecorator } from '@irdashies/storybook';
import type { TrackSection } from '@irdashies/types';

export default {
  component: CornerNameOverlay,
  title: 'widgets/CornerNameOverlay',
  decorators: [TelemetryDecorator()],
  args: {
    showSubtitle: true,
    showCornerNumber: true,
    showProgressBar: true,
    fontSize: 18,
    opacity: 0.9,
  },
} as Meta;

type Story = StoryObj<typeof CornerNameOverlay>;

const MOCK_SECTIONS: TrackSection[] = [
  {
    section_id: 'turn1',
    name: 'Turn 1 - Senna S',
    subtitle: 'High-speed left-right — commit to the first apex',
    corner_number: 'T1',
    start_pct: 0.0,
    end_pct: 0.12,
  },
  {
    section_id: 'turn3',
    name: 'Turn 3 - The Esses',
    subtitle: 'Iconic downhill right — blind entry over crest',
    corner_number: 'T3',
    start_pct: 0.12,
    end_pct: 0.28,
  },
  {
    section_id: 'turn5',
    name: 'Turn 5 - Descent',
    subtitle: 'Long left under braking into compression',
    corner_number: 'T5',
    start_pct: 0.28,
    end_pct: 0.42,
  },
  {
    section_id: 'straight1',
    name: 'Back Straight',
    start_pct: 0.42,
    end_pct: 0.58,
  },
  {
    section_id: 'turn7',
    name: 'Turn 7 - Laranjinha',
    subtitle: 'Off-camber right — patience on entry',
    corner_number: 'T7',
    start_pct: 0.58,
    end_pct: 0.72,
  },
  {
    section_id: 'turn9',
    name: 'Turn 9 - Pinheirinho',
    subtitle: 'Fast kink — flat if brave',
    corner_number: 'T9',
    start_pct: 0.72,
    end_pct: 0.85,
  },
  {
    section_id: 'turn11',
    name: 'Turn 11 - Junção',
    subtitle: 'Slow hairpin — maximize exit for pit straight',
    corner_number: 'T11',
    start_pct: 0.85,
    end_pct: 1.0,
  },
];

function TrackSectionSeeder({
  sections,
  lapDistPct,
}: {
  sections: TrackSection[];
  lapDistPct?: number;
}) {
  useEffect(() => {
    useCoachingStore.getState().setTrackSections(sections);

    // Seed telemetry with a LapDistPct value for demo
    if (lapDistPct !== undefined) {
      useTelemetryStore.getState().setTelemetry({
        LapDistPct: { value: [lapDistPct], unit: '' },
      } as never);
    }
  }, [sections, lapDistPct]);
  return null;
}

export const Turn1Entry: Story = {
  render: (args) => (
    <div className="w-72">
      <TrackSectionSeeder sections={MOCK_SECTIONS} lapDistPct={0.03} />
      <CornerNameOverlay {...args} />
    </div>
  ),
};

export const MidCorner: Story = {
  render: (args) => (
    <div className="w-72">
      <TrackSectionSeeder sections={MOCK_SECTIONS} lapDistPct={0.2} />
      <CornerNameOverlay {...args} />
    </div>
  ),
};

export const BackStraight: Story = {
  render: (args) => (
    <div className="w-72">
      <TrackSectionSeeder sections={MOCK_SECTIONS} lapDistPct={0.5} />
      <CornerNameOverlay {...args} />
    </div>
  ),
};

export const NoSections: Story = {
  render: (args) => (
    <div className="w-72">
      <TrackSectionSeeder sections={[]} />
      <CornerNameOverlay {...args} />
    </div>
  ),
};

export const WithoutSubtitle: Story = {
  args: {
    showSubtitle: false,
  },
  render: (args) => (
    <div className="w-72">
      <TrackSectionSeeder sections={MOCK_SECTIONS} lapDistPct={0.65} />
      <CornerNameOverlay {...args} />
    </div>
  ),
};

export const LargeFontSize: Story = {
  args: {
    fontSize: 24,
  },
  render: (args) => (
    <div className="w-96">
      <TrackSectionSeeder sections={MOCK_SECTIONS} lapDistPct={0.9} />
      <CornerNameOverlay {...args} />
    </div>
  ),
};
