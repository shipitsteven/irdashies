import { useEffect, useRef } from 'react';
import type { ServiceNotification, NotificationLevel } from '@irdashies/types';

interface NotificationToastsProps {
  notifications: ServiceNotification[];
  onDismiss: (id: string) => void;
  maxVisible?: number;
}

const DEFAULT_DISMISS_MS: Record<NotificationLevel, number | undefined> = {
  error: undefined, // sticky
  warning: 10_000,
  info: 5_000,
  success: 3_000,
};

const LEVEL_CONFIG: Record<
  NotificationLevel,
  { borderColor: string; icon: string; bgColor: string }
> = {
  error: {
    borderColor: 'border-l-red-500',
    icon: '⚠️',
    bgColor: 'bg-red-950/40',
  },
  warning: {
    borderColor: 'border-l-amber-500',
    icon: '⚡',
    bgColor: 'bg-amber-950/40',
  },
  info: {
    borderColor: 'border-l-blue-500',
    icon: 'ℹ️',
    bgColor: 'bg-blue-950/40',
  },
  success: {
    borderColor: 'border-l-green-500',
    icon: '✅',
    bgColor: 'bg-green-950/40',
  },
};

const SOURCE_LABELS: Record<string, string> = {
  llm: 'LLM',
  track: 'Track',
  alien: 'Alien',
  service: 'Service',
  adapter: 'Adapter',
};

function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: ServiceNotification;
  onDismiss: (id: string) => void;
}) {
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = LEVEL_CONFIG[notification.level];

  const autoDismissMs =
    notification.autoDismissMs ?? DEFAULT_DISMISS_MS[notification.level];

  useEffect(() => {
    if (autoDismissMs != null) {
      dismissTimer.current = setTimeout(() => {
        onDismiss(notification.id);
      }, autoDismissMs);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [notification.id, autoDismissMs, onDismiss]);

  return (
    <div
      className={`notification-toast border-l-2 ${config.borderColor} ${config.bgColor} rounded-r-sm px-2 py-1.5 cursor-pointer flex items-start gap-1.5 max-w-full`}
      onClick={() => onDismiss(notification.id)}
      role="alert"
    >
      <span className="text-xs shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500 uppercase font-medium">
            {SOURCE_LABELS[notification.source] || notification.source}
          </span>
        </div>
        <p className="text-xs text-slate-200 leading-tight truncate">
          {notification.message}
        </p>
        {notification.detail && (
          <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">
            {notification.detail}
          </p>
        )}
      </div>
    </div>
  );
}

export const NotificationToasts = ({
  notifications,
  onDismiss,
  maxVisible = 3,
}: NotificationToastsProps) => {
  const visible = notifications.slice(0, maxVisible);

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 mb-1.5">
      {visible.map((n) => (
        <NotificationToast key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
