import { useCoachingStore } from '@irdashies/context';
import type { CoachingResponse } from '@irdashies/types';

interface UseCoachingReturn {
  latestCoaching: CoachingResponse | null;
  coachingHistory: CoachingResponse[];
  serviceConnected: boolean;
  isProcessing: boolean;
}

export const useCoaching = (): UseCoachingReturn => {
  const latestCoaching = useCoachingStore((s) => s.latestCoaching);
  const coachingHistory = useCoachingStore((s) => s.coachingHistory);
  const serviceConnected = useCoachingStore((s) => s.serviceConnected);
  const isProcessing = useCoachingStore((s) => s.isProcessing);

  return { latestCoaching, coachingHistory, serviceConnected, isProcessing };
};
