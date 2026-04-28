import { useCoachingStore } from '@irdashies/context';
import type { ServiceNotification, ServiceStatus } from '@irdashies/types';

interface UseNotificationsReturn {
  notifications: ServiceNotification[];
  serviceStatus: ServiceStatus;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useNotifications = (): UseNotificationsReturn => {
  const notifications = useCoachingStore((s) => s.notifications);
  const serviceStatus = useCoachingStore((s) => s.serviceStatus);
  const dismissNotification = useCoachingStore((s) => s.dismissNotification);
  const clearNotifications = useCoachingStore((s) => s.clearNotifications);

  return { notifications, serviceStatus, dismissNotification, clearNotifications };
};
