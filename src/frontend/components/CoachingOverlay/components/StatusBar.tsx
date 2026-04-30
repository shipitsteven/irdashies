import { useState } from 'react';
import type { ServiceStatus } from '@irdashies/types';

interface StatusBarProps {
  status: ServiceStatus;
  notificationCount: number;
}

type StatusState = 'ready' | 'processing' | 'degraded' | 'disconnected' | 'loading';

function resolveState(status: ServiceStatus): {
  state: StatusState;
  label: string;
  dotClass: string;
} {
  if (!status.connected) {
    return {
      state: 'disconnected',
      label: 'Service offline',
      dotClass: 'bg-red-500',
    };
  }

  if (status.processing) {
    return {
      state: 'processing',
      label: 'Thinking...',
      dotClass: 'bg-amber-400 animate-pulse',
    };
  }

  // Degraded states — only show if we actually know LLM is unavailable (not null/unknown)
  if (status.activeFallback || status.llmAvailable === false) {
    const reason = status.activeFallback === 'no_alien'
      ? 'no alien data'
      : status.llmAvailable === false
        ? 'LLM unavailable'
        : status.activeFallback || 'limited mode';
    return {
      state: 'degraded',
      label: `Limited — ${reason}`,
      dotClass: 'bg-orange-400',
    };
  }

  if (status.trackLoaded === null && status.connected) {
    return {
      state: 'loading',
      label: 'Loading track data...',
      dotClass: 'bg-blue-400 animate-pulse',
    };
  }

  return {
    state: 'ready',
    label: 'Ready',
    dotClass: 'bg-green-400',
  };
}

export const StatusBar = ({ status, notificationCount }: StatusBarProps) => {
  const [expanded, setExpanded] = useState(false);
  const { label, dotClass, state } = resolveState(status);

  const showLabel = expanded || state === 'degraded' || state === 'disconnected';

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer select-none"
      onClick={() => setExpanded(!expanded)}
      title={label}
    >
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />

      {/* Status label (shown on hover/expand or warnings) */}
      {showLabel && (
        <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
          {label}
        </span>
      )}

      {/* Notification badge */}
      {notificationCount > 0 && (
        <span className="ml-auto bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
          {notificationCount > 9 ? '9+' : notificationCount}
        </span>
      )}
    </div>
  );
};
