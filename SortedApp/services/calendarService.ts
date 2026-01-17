// services/calendarService.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../api/firebase';

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
}

export interface CalendarEventData {
  eventId: string;
  houseId: string;
  title: string;
  description?: string;
  startDate: Timestamp;
  recurrence: RecurrenceRule;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum CalendarServiceErrorCode {
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_INPUT = 'INVALID_INPUT',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  USER_NOT_IN_HOUSE = 'USER_NOT_IN_HOUSE',
  HOUSE_NOT_FOUND = 'HOUSE_NOT_FOUND',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface CalendarServiceError {
  code: CalendarServiceErrorCode;
  message: string;
  originalError?: any;
}

class CalendarService {
  async addEvent(
    houseId: string,
    createdBy: string,
    title: string,
    startDate: Date,
    description?: string,
    recurrence?: Partial<RecurrenceRule>
  ): Promise<CalendarEventData> {
    try {
      if (!houseId || !createdBy) {
        throw this.createError(
          CalendarServiceErrorCode.INVALID_INPUT,
          'House ID and user ID are required.'
        );
      }

      if (!title.trim()) {
        throw this.createError(
          CalendarServiceErrorCode.INVALID_INPUT,
          'Event title is required.'
        );
      }

      if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
        throw this.createError(
          CalendarServiceErrorCode.INVALID_INPUT,
          'Please provide a valid date.'
        );
      }

      await this.verifyUserInHouse(createdBy, houseId);

      const userDoc = await getDoc(doc(db, 'users', createdBy));
      const createdByName = userDoc.exists()
        ? (userDoc.data().name as string) || 'Unknown'
        : 'Unknown';

      const eventsRef = collection(db, 'houses', houseId, 'events');
      const newEvent = {
        houseId,
        title: title.trim(),
        description: description?.trim() || '',
        startDate: Timestamp.fromDate(startDate),
        recurrence: {
          frequency: recurrence?.frequency ?? 'none',
          interval: recurrence?.interval ?? 1,
        },
        createdBy,
        createdByName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(eventsRef, newEvent);

      return {
        eventId: docRef.id,
        ...newEvent,
      } as CalendarEventData;
    } catch (error) {
      if (this.isCalendarServiceError(error)) {
        throw error;
      }
      throw this.createError(
        CalendarServiceErrorCode.TRANSACTION_FAILED,
        'Failed to add event. Please try again.',
        error
      );
    }
  }

  async updateEvent(
    houseId: string,
    eventId: string,
    updates: Partial<{
      title: string;
      description?: string;
      startDate: Date;
      recurrence: RecurrenceRule;
    }>,
    userId: string
  ): Promise<void> {
    try {
      if (!houseId || !eventId || !userId) {
        throw this.createError(
          CalendarServiceErrorCode.INVALID_INPUT,
          'House ID, event ID, and user ID are required.'
        );
      }

      await this.verifyUserInHouse(userId, houseId);

      const eventRef = doc(db, 'houses', houseId, 'events', eventId);
      const eventDoc = await getDoc(eventRef);
      if (!eventDoc.exists()) {
        throw this.createError(
          CalendarServiceErrorCode.EVENT_NOT_FOUND,
          'Event not found.'
        );
      }

      const payload: any = {
        updatedAt: serverTimestamp(),
      };

      if (updates.title !== undefined) {
        payload.title = updates.title.trim();
      }
      if (updates.description !== undefined) {
        payload.description = updates.description.trim();
      }
      if (updates.startDate !== undefined) {
        payload.startDate = Timestamp.fromDate(updates.startDate);
      }
      if (updates.recurrence !== undefined) {
        payload.recurrence = updates.recurrence;
      }

      await updateDoc(eventRef, payload);
    } catch (error) {
      if (this.isCalendarServiceError(error)) {
        throw error;
      }
      throw this.createError(
        CalendarServiceErrorCode.TRANSACTION_FAILED,
        'Failed to update event. Please try again.',
        error
      );
    }
  }

  async deleteEvent(houseId: string, eventId: string, userId: string): Promise<void> {
    try {
      if (!houseId || !eventId || !userId) {
        throw this.createError(
          CalendarServiceErrorCode.INVALID_INPUT,
          'House ID, event ID, and user ID are required.'
        );
      }

      await this.verifyUserInHouse(userId, houseId);

      const eventRef = doc(db, 'houses', houseId, 'events', eventId);
      const eventDoc = await getDoc(eventRef);
      if (!eventDoc.exists()) {
        throw this.createError(
          CalendarServiceErrorCode.EVENT_NOT_FOUND,
          'Event not found.'
        );
      }

      await deleteDoc(eventRef);
    } catch (error) {
      if (this.isCalendarServiceError(error)) {
        throw error;
      }
      throw this.createError(
        CalendarServiceErrorCode.TRANSACTION_FAILED,
        'Failed to delete event. Please try again.',
        error
      );
    }
  }

  async getHouseEvents(houseId: string): Promise<CalendarEventData[]> {
    try {
      if (!houseId) {
        throw this.createError(
          CalendarServiceErrorCode.INVALID_INPUT,
          'House ID is required.'
        );
      }

      const eventsRef = collection(db, 'houses', houseId, 'events');
      const q = query(eventsRef, orderBy('startDate', 'asc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        eventId: docSnap.id,
        ...docSnap.data(),
      })) as CalendarEventData[];
    } catch (error) {
      if (this.isCalendarServiceError(error)) {
        throw error;
      }
      throw this.createError(
        CalendarServiceErrorCode.UNKNOWN_ERROR,
        'Failed to fetch events.',
        error
      );
    }
  }

  subscribeToEvents(
    houseId: string,
    callback: (events: CalendarEventData[]) => void
  ): () => void {
    if (!houseId) {
      throw this.createError(
        CalendarServiceErrorCode.INVALID_INPUT,
        'House ID is required.'
      );
    }

    const eventsRef = collection(db, 'houses', houseId, 'events');
    const q = query(eventsRef, orderBy('startDate', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const events = snapshot.docs.map((docSnap) => ({
          eventId: docSnap.id,
          ...docSnap.data(),
        })) as CalendarEventData[];
        callback(events);
      },
      (error) => {
        console.error('Error in events subscription:', error);
        callback([]);
      }
    );

    return unsubscribe;
  }

  private async verifyUserInHouse(userId: string, houseId: string): Promise<void> {
    const houseDoc = await getDoc(doc(db, 'houses', houseId));

    if (!houseDoc.exists()) {
      throw this.createError(
        CalendarServiceErrorCode.HOUSE_NOT_FOUND,
        'House not found.'
      );
    }

    const members = (houseDoc.data().members || []) as string[];

    if (!members.includes(userId)) {
      throw this.createError(
        CalendarServiceErrorCode.USER_NOT_IN_HOUSE,
        'You are not a member of this house.'
      );
    }
  }

  private createError(
    code: CalendarServiceErrorCode,
    message: string,
    originalError?: any
  ): CalendarServiceError {
    return { code, message, originalError };
  }

  private isCalendarServiceError(error: any): error is CalendarServiceError {
    return error && typeof error.code === 'string' && typeof error.message === 'string';
  }
}

export default new CalendarService();
