import { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { CoachingOverlay } from './CoachingOverlay';
import { useCoachingStore } from '@irdashies/context';
import type {
  CoachingResponse,
  SectionFeedback,
  ServiceStatus,
  ServiceNotification,
} from '@irdashies/types';

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

const MOCK_SERVICE_STATUS_READY: ServiceStatus = {
  connected: true,
  processing: false,
  lastError: null,
  trackLoaded: 'spa_francorchamps_gp',
  alienLoaded: true,
  llmAvailable: true,
  activeFallback: null,
};

const MOCK_SERVICE_STATUS_PROCESSING: ServiceStatus = {
  ...MOCK_SERVICE_STATUS_READY,
  processing: true,
};

const MOCK_SERVICE_STATUS_DEGRADED: ServiceStatus = {
  connected: true,
  processing: false,
  lastError: null,
  trackLoaded: 'spa_francorchamps_gp',
  alienLoaded: false,
  llmAvailable: true,
  activeFallback: 'no_alien',
};

const MOCK_SERVICE_STATUS_DISCONNECTED: ServiceStatus = {
  connected: false,
  processing: false,
  lastError: 'Connection refused',
  trackLoaded: null,
  alienLoaded: false,
  llmAvailable: false,
  activeFallback: null,
};

const MOCK_SERVICE_STATUS_LOADING: ServiceStatus = {
  connected: true,
  processing: false,
  lastError: null,
  trackLoaded: null,
  alienLoaded: false,
  llmAvailable: true,
  activeFallback: null,
};

const MOCK_NOTIFICATIONS: ServiceNotification[] = [
  {
    id: 'notif_1',
    level: 'error',
    message: 'LLM request timed out after 30s',
    source: 'llm',
    timestamp: Date.now() - 5000,
  },
  {
    id: 'notif_2',
    level: 'warning',
    message: 'LLM unavailable — showing raw analysis',
    source: 'llm',
    timestamp: Date.now() - 3000,
    autoDismissMs: 10000,
  },
  {
    id: 'notif_3',
    level: 'info',
    message: 'Track data loaded: Spa-Francorchamps GP',
    source: 'track',
    timestamp: Date.now() - 1000,
    autoDismissMs: 5000,
  },
];

function CoachingSeeder({
  coaching,
  connected,
  processing,
  serviceStatus,
}: {
  coaching?: CoachingResponse;
  connected?: boolean;
  processing?: boolean;
  serviceStatus?: ServiceStatus;
}) {
  useEffect(() => {
    if (coaching) {
      useCoachingStore.getState().setCoaching(coaching);
    }
    if (serviceStatus) {
      useCoachingStore.getState().setServiceStatus(serviceStatus);
    } else {
      useCoachingStore
        .getState()
        .setServiceConnected(connected ?? true);
      useCoachingStore
        .getState()
        .setIsProcessing(processing ?? false);
    }
  }, [coaching, connected, processing, serviceStatus]);
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

function NotificationSeeder({
  notifications,
}: {
  notifications: ServiceNotification[];
}) {
  useEffect(() => {
    // Clear existing, then seed
    useCoachingStore.getState().clearNotifications();
    notifications.forEach((n) => {
      useCoachingStore.getState().addNotification({
        level: n.level,
        message: n.message,
        detail: n.detail,
        source: n.source,
        autoDismissMs: n.autoDismissMs,
      });
    });
  }, [notifications]);
  return null;
}

// ─── Existing Stories ─────────────────────────────────────────────────────────

export const Connected: Story = {
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_READY}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const Processing: Story = {
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_PROCESSING}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const Disconnected: Story = {
  render: (args) => (
    <>
      <CoachingSeeder serviceStatus={MOCK_SERVICE_STATUS_DISCONNECTED} />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const WithSectionFeedback: Story = {
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_READY}
      />
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
        <CoachingSeeder
          coaching={pbCoaching}
          serviceStatus={MOCK_SERVICE_STATUS_READY}
        />
        <CoachingOverlay {...args} />
      </>
    );
  },
};

export const EmptyState: Story = {
  render: (args) => (
    <>
      <CoachingSeeder serviceStatus={MOCK_SERVICE_STATUS_READY} />
      <CoachingOverlay {...args} />
    </>
  ),
};

// ─── StatusBar Stories ────────────────────────────────────────────────────────

export const StatusReady: Story = {
  name: 'StatusBar / Ready',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_READY}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const StatusProcessing: Story = {
  name: 'StatusBar / Processing',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_PROCESSING}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const StatusDegraded: Story = {
  name: 'StatusBar / Degraded',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_DEGRADED}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const StatusDisconnected: Story = {
  name: 'StatusBar / Disconnected',
  render: (args) => (
    <>
      <CoachingSeeder serviceStatus={MOCK_SERVICE_STATUS_DISCONNECTED} />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const StatusLoading: Story = {
  name: 'StatusBar / Loading Track',
  render: (args) => (
    <>
      <CoachingSeeder serviceStatus={MOCK_SERVICE_STATUS_LOADING} />
      <CoachingOverlay {...args} />
    </>
  ),
};

// ─── Notification Stories ─────────────────────────────────────────────────────

export const NotificationError: Story = {
  name: 'Notifications / Error',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_READY}
      />
      <NotificationSeeder
        notifications={[
          {
            id: 'err1',
            level: 'error',
            message: 'LLM request timed out after 30s',
            source: 'llm',
            timestamp: Date.now(),
          },
        ]}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const NotificationWarning: Story = {
  name: 'Notifications / Warning',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_DEGRADED}
      />
      <NotificationSeeder
        notifications={[
          {
            id: 'warn1',
            level: 'warning',
            message: 'LLM unavailable — showing raw analysis',
            source: 'llm',
            timestamp: Date.now(),
            autoDismissMs: 10000,
          },
        ]}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const NotificationInfo: Story = {
  name: 'Notifications / Info',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_READY}
      />
      <NotificationSeeder
        notifications={[
          {
            id: 'info1',
            level: 'info',
            message: 'Track data loaded: Spa-Francorchamps GP',
            source: 'track',
            timestamp: Date.now(),
            autoDismissMs: 5000,
          },
        ]}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const NotificationSuccess: Story = {
  name: 'Notifications / Success',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_READY}
      />
      <NotificationSeeder
        notifications={[
          {
            id: 'suc1',
            level: 'success',
            message: 'Alien lap data synced successfully',
            source: 'alien',
            timestamp: Date.now(),
            autoDismissMs: 3000,
          },
        ]}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const NotificationsStacked: Story = {
  name: 'Notifications / Stacked (3 max)',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_DEGRADED}
      />
      <NotificationSeeder notifications={MOCK_NOTIFICATIONS} />
      <CoachingOverlay {...args} />
    </>
  ),
};

export const NotificationsWithBadge: Story = {
  name: 'Notifications / Badge Count',
  render: (args) => (
    <>
      <CoachingSeeder
        coaching={MOCK_COACHING}
        serviceStatus={MOCK_SERVICE_STATUS_READY}
      />
      <NotificationSeeder
        notifications={[
          ...MOCK_NOTIFICATIONS,
          {
            id: 'notif_4',
            level: 'success',
            message: 'Connection restored',
            source: 'service',
            timestamp: Date.now(),
            autoDismissMs: 3000,
          },
        ]}
      />
      <CoachingOverlay {...args} />
    </>
  ),
};
