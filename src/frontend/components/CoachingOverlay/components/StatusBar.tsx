import { useState } from 'react';
import type { ServiceStatus } from '@irdashies/types';

interface StatusBarProps {
  status: ServiceStatus;
  notificationCount: number;
}

// ─── State Machine ──────────────────────────────────────────────────────────
//
//  ┌─────────────┐    service found     ┌──────────┐
//  │ disconnected │───────────────────►  │ loading  │
//  └─────────────┘                       └──────────┘
//         ▲                                   │
//         │ service lost              track loaded / llm known
//         │                                   │
//         │                  ┌────────────────┼────────────────┐
//         │                  ▼                ▼                ▼
//         │            ┌──────────┐    ┌───────────┐    ┌──────────┐
//         ├────────────│  ready   │    │  degraded  │    │  ready   │
//         │            └──────────┘    └───────────┘    └──────────┘
//         │                  │                │                │
//         │                  ▼                ▼                ▼
//         │            ┌──────────────────────────────────────────┐
//         └────────────│            processing                    │
//                      └──────────────────────────────────────────┘
//
// Inputs (from ServiceStatus):
//   connected       → boolean
//   processing      → boolean
//   trackLoaded     → string | null
//   llmAvailable    → true | false | null (null = unknown, no call yet)
//   activeFallback  → string | null
//   lastError       → string | null

type StatusState =
  | 'disconnected'
  | 'loading'
  | 'ready'
  | 'processing'
  | 'degraded';

interface ResolvedStatus {
  state: StatusState;
  label: string;
  dotClass: string;
}

// Transition table — pure function of ServiceStatus → visual state.
// Priority order: disconnected > processing > degraded > loading > ready.
// Each row is a guard → output. First match wins.
const TRANSITIONS: Array<{
  guard: (s: ServiceStatus) => boolean;
  output: (s: ServiceStatus) => ResolvedStatus;
}> = [
  {
    guard: (s) => !s.connected,
    output: () => ({
      state: 'disconnected',
      label: 'Service offline',
      dotClass: 'bg-red-500',
    }),
  },
  {
    guard: (s) => s.processing,
    output: () => ({
      state: 'processing',
      label: 'Thinking...',
      dotClass: 'bg-amber-400 animate-pulse',
    }),
  },
  {
    // Explicit LLM failure — only when we've actually tried and failed
    guard: (s) => s.llmAvailable === false,
    output: () => ({
      state: 'degraded',
      label: 'Limited — LLM unavailable',
      dotClass: 'bg-orange-400',
    }),
  },
  {
    // Active fallback mode (no alien data, analysis only, etc.)
    guard: (s) => s.activeFallback !== null && s.activeFallback !== undefined,
    output: (s) => ({
      state: 'degraded',
      label: `Limited — ${s.activeFallback === 'no_alien' ? 'no alien data' : s.activeFallback}`,
      dotClass: 'bg-orange-400',
    }),
  },
  {
    // Connected but no track yet
    guard: (s) => s.connected && s.trackLoaded === null,
    output: () => ({
      state: 'loading',
      label: 'Waiting for track...',
      dotClass: 'bg-blue-400 animate-pulse',
    }),
  },
  {
    // Default: everything is fine (or unknown — we don't cry wolf)
    guard: () => true,
    output: () => ({
      state: 'ready',
      label: 'Ready',
      dotClass: 'bg-green-400',
    }),
  },
];

function resolveState(status: ServiceStatus): ResolvedStatus {
  for (const { guard, output } of TRANSITIONS) {
    if (guard(status)) return output(status);
  }
  // Unreachable — last guard is always true
  return { state: 'ready', label: 'Ready', dotClass: 'bg-green-400' };
}

// ─── Component ──────────────────────────────────────────────────────────────

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
