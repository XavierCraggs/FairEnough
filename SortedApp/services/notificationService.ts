// services/notificationService.ts
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  Timestamp,
  limit,
  where,
} from 'firebase/firestore';
import { db } from '../api/firebase';

export type AlfredNotificationType =
  | 'CHORE_DUE'
  | 'BILL_ADDED'
  | 'NUDGE'
  | 'MEETING_REQUEST';

export interface AlfredNotificationData {
  notificationId: string;
  houseId: string;
  type: AlfredNotificationType;
  message: string;
  metadata?: Record<string, any>;
  triggeredBy: string;
  readBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum NotificationServiceErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  HOUSE_NOT_FOUND = 'HOUSE_NOT_FOUND',
  USER_NOT_IN_HOUSE = 'USER_NOT_IN_HOUSE',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface NotificationServiceError {
  code: NotificationServiceErrorCode;
  message: string;
  originalError?: any;
}

const pickRandom = (options: string[]) =>
  options[Math.floor(Math.random() * options.length)];

const formatCurrency = (amount?: number) =>
  typeof amount === 'number' ? `$${amount.toFixed(2)}` : '$0.00';

export const getAlfredMessage = (
  type: AlfredNotificationType,
  metadata?: Record<string, any>
): string => {
  switch (type) {
    case 'CHORE_DUE': {
      const choreName = metadata?.choreName || 'a chore';
      if (metadata?.action === 'completed') {
        return pickRandom([
          `Splendid news: ${choreName} has been completed. Well done.`,
          `Excellent work! ${choreName} is now checked off.`,
          `A tidy update: ${choreName} has been handled.`,
        ]);
      }
      if (metadata?.action === 'assigned') {
        return pickRandom([
          `A quick note: ${choreName} has been assigned. Thank you in advance.`,
          `If I may, ${choreName} has been assigned and awaits attention.`,
          `Just so you know, ${choreName} is now assigned.`,
        ]);
      }
      if (metadata?.action === 'overdue') {
        return pickRandom([
          `Pardon me, ${choreName} is overdue. Might someone take a moment?`,
          `A gentle reminder: ${choreName} has slipped past its due moment.`,
          `If convenient, ${choreName} could use some attention today.`,
        ]);
      }
      return pickRandom([
        `I say, ${choreName} appears to be languishing. Might someone attend to it?`,
        `A gentle reminder: ${choreName} is still waiting for attention.`,
        `If I may, ${choreName} would love a helping hand today.`,
      ]);
    }
    case 'BILL_ADDED': {
      const amount = formatCurrency(metadata?.amount);
      return pickRandom([
        `Pardon me, a new expense of ${amount} has been recorded for the household.`,
        `Just a heads-up: I have logged a bill totaling ${amount}.`,
        `A new household expense (${amount}) has been added to the ledger.`,
      ]);
    }
    case 'MEETING_REQUEST': {
      const subject = metadata?.subject || 'a house meeting';
      return pickRandom([
        `Might we schedule ${subject}? A brief gathering could do wonders.`,
        `A suggestion from the butler: perhaps it's time for ${subject}.`,
        `If convenient, ${subject} would be most helpful for the household.`,
      ]);
    }
    case 'NUDGE':
    default: {
      const subject = metadata?.subject || 'a gentle reminder';
      return pickRandom([
        `If I may, a small reminder about ${subject}.`,
        `Just a courteous nudge regarding ${subject}.`,
        `Forgive the interruption—${subject} would appreciate attention.`,
      ]);
    }
  }
};

class NotificationService {
  async sendAlfredNudge(
    houseId: string,
    triggeredBy: string,
    type: AlfredNotificationType,
    metadata?: Record<string, any>
  ): Promise<AlfredNotificationData> {
    try {
      if (!houseId || !triggeredBy) {
        throw this.createError(
          NotificationServiceErrorCode.INVALID_INPUT,
          'House ID and user ID are required.'
        );
      }

      await this.verifyUserInHouse(triggeredBy, houseId);

      const notificationsRef = collection(db, 'houses', houseId, 'notifications');
      const message = getAlfredMessage(type, metadata);
      const newNotification = {
        houseId,
        type,
        message,
        metadata: metadata || {},
        triggeredBy,
        readBy: [triggeredBy],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(notificationsRef, newNotification);

      return {
        notificationId: docRef.id,
        ...newNotification,
      } as AlfredNotificationData;
    } catch (error) {
      if (this.isNotificationServiceError(error)) {
        throw error;
      }
      throw this.createError(
        NotificationServiceErrorCode.TRANSACTION_FAILED,
        'Failed to send Alfred notification.',
        error
      );
    }
  }

  async markNotificationRead(
    houseId: string,
    notificationId: string,
    userId: string
  ): Promise<void> {
    try {
      if (!houseId || !notificationId || !userId) {
        throw this.createError(
          NotificationServiceErrorCode.INVALID_INPUT,
          'House ID, notification ID, and user ID are required.'
        );
      }

      await this.verifyUserInHouse(userId, houseId);

      const notificationRef = doc(
        db,
        'houses',
        houseId,
        'notifications',
        notificationId
      );
      await updateDoc(notificationRef, {
        readBy: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      if (this.isNotificationServiceError(error)) {
        throw error;
      }
      throw this.createError(
        NotificationServiceErrorCode.TRANSACTION_FAILED,
        'Failed to mark notification as read.',
        error
      );
    }
  }

  async getHouseNotifications(houseId: string, max = 50): Promise<AlfredNotificationData[]> {
    try {
      if (!houseId) {
        throw this.createError(
          NotificationServiceErrorCode.INVALID_INPUT,
          'House ID is required.'
        );
      }

      const notificationsRef = collection(db, 'houses', houseId, 'notifications');
      const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(max));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        notificationId: docSnap.id,
        ...docSnap.data(),
      })) as AlfredNotificationData[];
    } catch (error) {
      if (this.isNotificationServiceError(error)) {
        throw error;
      }
      throw this.createError(
        NotificationServiceErrorCode.UNKNOWN_ERROR,
        'Failed to fetch notifications.',
        error
      );
    }
  }

  async hasRecentNotification(
    houseId: string,
    type: AlfredNotificationType,
    metadataFilter: Record<string, any>,
    since: Date
  ): Promise<boolean> {
    try {
      if (!houseId) {
        return false;
      }

      const notificationsRef = collection(db, 'houses', houseId, 'notifications');
      const q = query(
        notificationsRef,
        where('createdAt', '>=', Timestamp.fromDate(since)),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return false;
      }

      const metadataKeys = Object.keys(metadataFilter || {});
      return snapshot.docs.some((docSnap) => {
        const data = docSnap.data();
        if (data.type !== type) {
          return false;
        }
        return metadataKeys.every((key) => data?.metadata?.[key] === metadataFilter[key]);
      });
    } catch (error) {
      console.error('Failed to check recent Alfred notifications:', error);
      return false;
    }
  }

  subscribeToNotifications(
    houseId: string,
    callback: (notifications: AlfredNotificationData[]) => void
  ): () => void {
    if (!houseId) {
      throw this.createError(
        NotificationServiceErrorCode.INVALID_INPUT,
        'House ID is required.'
      );
    }

    const notificationsRef = collection(db, 'houses', houseId, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifications = snapshot.docs.map((docSnap) => ({
          notificationId: docSnap.id,
          ...docSnap.data(),
        })) as AlfredNotificationData[];
        callback(notifications);
      },
      (error) => {
        console.error('Error in Alfred notifications subscription:', error);
        callback([]);
      }
    );

    return unsubscribe;
  }

  private async verifyUserInHouse(userId: string, houseId: string): Promise<void> {
    const houseDoc = await getDoc(doc(db, 'houses', houseId));

    if (!houseDoc.exists()) {
      throw this.createError(
        NotificationServiceErrorCode.HOUSE_NOT_FOUND,
        'House not found.'
      );
    }

    const members = (houseDoc.data().members || []) as string[];

    if (!members.includes(userId)) {
      throw this.createError(
        NotificationServiceErrorCode.USER_NOT_IN_HOUSE,
        'You are not a member of this house.'
      );
    }
  }

  private createError(
    code: NotificationServiceErrorCode,
    message: string,
    originalError?: any
  ): NotificationServiceError {
    return { code, message, originalError };
  }

  private isNotificationServiceError(error: any): error is NotificationServiceError {
    return error && typeof error.code === 'string' && typeof error.message === 'string';
  }
}

export default new NotificationService();
