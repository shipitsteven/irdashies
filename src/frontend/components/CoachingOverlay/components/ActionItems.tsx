import type { CoachingLine } from '@irdashies/types';

interface ActionItemsProps {
  lines: CoachingLine[];
  maxItems: number;
  fontSize: number;
}

export const ActionItems = ({ lines, maxItems, fontSize }: ActionItemsProps) => {
  const sorted = [...lines]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxItems);

  if (sorted.length === 0) return null;

  return (
    <ul className="space-y-1 list-none p-0 m-0">
      {sorted.map((line, i) => (
        <li
          key={`${line.priority}-${i}`}
          className="flex items-start gap-1.5"
          style={{ fontSize: `${fontSize}px` }}
        >
          <span className="text-green-400 mt-0.5 shrink-0">•</span>
          <span className="text-white/90 leading-tight">{line.text}</span>
        </li>
      ))}
    </ul>
  );
};
