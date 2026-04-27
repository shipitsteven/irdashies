import { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { CoachingOverlay } from './CoachingOverlay';
import { useCoachingStore } from '@irdashies/context';
import type { CoachingResponse, SectionFeedback } from '@irdashies/types';

export default {
  component: CoachingOverlay,
  title: 'widgets/CoachingOverlay',
  args: {
    showRadioMessage: true,
    radioFadeDuration: 10,
    showActionItems: true,
    maxActionItems: 5,
    showStatusIndicator: true,
    fontSize: 14,
    opacity: 0.9,
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} as Meta;

type Story = StoryObj<typeof CoachingOverlay>;

const MOCK_COACHING: CoachingResponse = {
  lap_number: 12,
  radio_message:
    "Good lap, but you're still losing time in Turn 3. Try braking 5 meters later and roll more mid-corner speed.",
  coaching_lines: [
    { text: 'Brake 5m later into Turn 3', priority: 1 },
    { text: 'Carry more speed through the apex in T3', priority: 2 },
    { text: 'Smooth throttle application exiting T7', priority: 3 },
    { text: 'Use all the kerb on exit T11', priority: 4 },
  ],
  behavior: 'overslowing',
  section_losses: [
    { section_id: 'turn3', loss_s: 0.35, tags: ['Overslowing', 'Early_Brake'] },
    { section_id: 'turn7', loss_s: 0.12, tags: ['Throttle_Hesitation'] },
  ],
  metadata: {
    is_pb: false,
    gap_to_alien: 1.8,
    processing_time_ms: 420,
  },
};

const MOCK_SECTION_FEEDBACK: SectionFeedback = {
  section_id: 'turn3',
  section_name: 'Turn 3 - The Esses',
  delta_alien_s: 0.35,
  delta_prev_s: -0.1,
  delta_best_s: 0.2,
  tags: ['Late_Throttle'],
  is_pb: false,
  trend: 'improving',
  message: 'Better entry, still losing on exit',
};

function CoachingSeeder({
  coaching,
  connected,
  processing,
}: {
  coaching?: CoachingResponse;
  connected?: boolean;
  processing?: boolean;
}) {
  useEffect(() => {
    if (coaching) {
      useCoachingStore.getState().setCoaching(coaching);
    }
    useCoachingStore
      .getState()
      .setServiceConnected(connected ?? true);
    useCoachingStore
      .getState()
      .setIsProcessing(processing ?? false);
  }, [coaching, connected, processing]);
  return null;
}

function SectionFeedbackSeeder({
  feedback,
}: {
  feedback: SectionFeedback;
}) {
  useEffect(() => {
    useCoachingStore.getState().setSectionFeedback(feedback);
  }, [feedback]);
  return null;
}

export const Connected: Story = {
  render: (args) => (
    <>
      <CoachingSeeder coaching={MOCK_COACHING} connected processing={false} />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const Processing: Story = {
  render: (args) => (
    <>
      <CoachingSeeder coaching={MOCK_COACHING} connected processing />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const Disconnected: Story = {
  render: (args) => (
    <>
      <CoachingSeeder connected={false} processing={false} />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const WithSectionFeedback: Story = {
  render: (args) => (
    <>
      <CoachingSeeder coaching={MOCK_COACHING} connected processing={false} />
      <SectionFeedbackSeeder feedback={MOCK_SECTION_FEEDBACK} />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const PersonalBest: Story = {
  render: (args) => {
    const pbCoaching: CoachingResponse = {
      ...MOCK_COACHING,
      radio_message:
        "New personal best! That was a clean lap. Let's see if we can find more in the chicane.",
      metadata: { ...MOCK_COACHING.metadata, is_pb: true, gap_to_alien: 0.9 },
    };
    return (
      <>
        <CoachingSeeder coaching={pbCoaching} connected processing={false} />
        <CoachingOverlay {...args} />
      </>
    );
  },
};

export const EmptyState: Story = {
  render: (args) => (
    <>
      <CoachingSeeder connected processing={false} />
      <CoachingOverlay {...args} />
    </>
  ),
};
