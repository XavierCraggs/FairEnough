import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import notificationService, {
  AlfredNotificationData,
  NotificationServiceError,
} from '../services/notificationService';

interface UseAlfredOptions {
  houseId: string | null;
  userId: string | null;
  suppressOwn?: boolean;
}

export const useAlfred = ({ houseId, userId, suppressOwn = true }: UseAlfredOptions) => {
  const [notifications, setNotifications] = useState<AlfredNotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!houseId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = notificationService.subscribeToNotifications(
      houseId,
      (items) => {
        setNotifications(items);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [houseId]);

  const latestNotification = useMemo(() => notifications[0] ?? null, [notifications]);

  const unreadNotifications = useMemo(() => {
    if (!userId) return [];
    return notifications.filter(
      (notification) =>
        !notification.readBy?.includes(userId) &&
        (!suppressOwn || notification.triggeredBy !== userId)
    );
  }, [notifications, userId, suppressOwn]);

  const nextUnread = unreadNotifications[0] ?? null;

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!houseId || !userId) return;
      try {
        await notificationService.markNotificationRead(houseId, notificationId, userId);
      } catch (error) {
        const serviceError = error as NotificationServiceError;
        console.error('Failed to mark Alfred notification read:', serviceError?.message);
      }
    },
    [houseId, userId]
  );

  const getNextUnreadToast = useCallback(() => {
    if (!nextUnread) return null;
    if (lastSeenIdRef.current === nextUnread.notificationId) {
      return null;
    }
    return nextUnread;
  }, [nextUnread]);

  const markToastSeen = useCallback((notificationId: string) => {
    lastSeenIdRef.current = notificationId;
  }, []);

  const resetToastSeen = useCallback(() => {
    lastSeenIdRef.current = null;
  }, []);

  return {
    notifications,
    latestNotification,
    unreadNotifications,
    loading,
    markAsRead,
    getNextUnreadToast,
    markToastSeen,
    resetToastSeen,
  };
};

export default useAlfred;
