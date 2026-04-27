import type { SectionFeedback } from '@irdashies/types';

interface SectionToastProps {
  feedback: SectionFeedback | null;
  fontSize: number;
}

export const SectionToast = ({ feedback, fontSize }: SectionToastProps) => {
  if (!feedback) return null;

  const deltaColor =
    feedback.delta_best_s <= 0 ? 'text-green-400' : 'text-amber-300';

  return (
    <div
      key={feedback.section_id}
      className="section-toast mt-1.5 px-2 py-1 rounded bg-slate-700/60 border-l-2 border-sky-400"
      style={{ fontSize: `${fontSize - 2}px` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-white/80 font-medium">
          {feedback.section_name}
        </span>
        <span className={`${deltaColor} tabular-nums font-mono`}>
          {feedback.delta_best_s >= 0 ? '+' : ''}
          {feedback.delta_best_s.toFixed(2)}s
        </span>
      </div>
      {feedback.message && (
        <div className="text-slate-300/70 text-xs mt-0.5">
          {feedback.message}
        </div>
      )}
    </div>
  );
};
