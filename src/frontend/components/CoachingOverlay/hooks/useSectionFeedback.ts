import { useCoachingStore } from '@irdashies/context';
import type { SectionFeedback } from '@irdashies/types';

interface UseSectionFeedbackReturn {
  /** Latest section feedback from the store (animation/fade handled by CSS) */
  visibleFeedback: SectionFeedback | null;
}

/**
 * Reads section feedback from the store.
 * The SectionToast component uses CSS animation for auto-fade behavior.
 */
export const useSectionFeedback = (): UseSectionFeedbackReturn => {
  const latestSectionFeedback = useCoachingStore(
    (s) => s.latestSectionFeedback
  );

  return { visibleFeedback: latestSectionFeedback };
};
