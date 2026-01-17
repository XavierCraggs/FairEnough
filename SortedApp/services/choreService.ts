// services/choreService.ts
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    runTransaction,
    writeBatch,
    serverTimestamp,
    increment,
    Timestamp,
  } from 'firebase/firestore';
  import { db } from '../api/firebase';
  import notificationService from './notificationService';
  
  /**
   * Chore data structure stored in Firestore
   */
  export interface ChoreData {
    choreId: string;
    houseId: string;
    title: string;
    description?: string;
    points: number;
    assignedTo: string | null; // UID of assigned user, null if unassigned
    frequency: 'daily' | 'weekly' | 'one-time';
    status: 'pending' | 'completed' | 'overdue';
    lastCompletedBy: string | null; // UID of last user who completed it
    lastCompletedAt: Timestamp | null;
    totalCompletions: number; // Track how many times this chore has been done
    createdBy: string;
    createdAt: any;
    updatedAt: any;
  }
  
  /**
   * Chore creation input
   */
  export interface CreateChoreInput {
    houseId: string;
    title: string;
    description?: string;
    points: number;
    assignedTo?: string | null;
    frequency: 'daily' | 'weekly' | 'one-time';
    createdBy: string;
  }
  
  /**
   * Custom error codes for chore service operations
   */
  export enum ChoreServiceErrorCode {
    CHORE_NOT_FOUND = 'CHORE_NOT_FOUND',
    UNAUTHORIZED = 'UNAUTHORIZED',
    INVALID_INPUT = 'INVALID_INPUT',
    TRANSACTION_FAILED = 'TRANSACTION_FAILED',
    USER_NOT_IN_HOUSE = 'USER_NOT_IN_HOUSE',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  }
  
  /**
   * Custom error type for chore service
   */
  export interface ChoreServiceError {
    code: ChoreServiceErrorCode;
    message: string;
    originalError?: any;
  }
  
  /**
   * Chore service for managing house chores
   * Implements atomic transactions for point updates
   */
  class ChoreService {
    /**
     * Add a new chore to a house
     * 
     * @param input - Chore creation data
     * @returns Created chore data
     * @throws ChoreServiceError on failure
     */
    async addChore(input: CreateChoreInput): Promise<ChoreData> {
      try {
        // Validate inputs
        if (!input.houseId || !input.title.trim() || input.points < 0) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'House ID, title, and valid points are required'
          );
        }
  
        // Verify house exists and user is a member
        await this.verifyUserInHouse(input.createdBy, input.houseId);
  
        // Create chore document
        const choreRef = collection(db, 'houses', input.houseId, 'chores');
        const newChore = {
          houseId: input.houseId,
          title: input.title.trim(),
          description: input.description?.trim() || '',
          points: input.points,
          assignedTo: input.assignedTo || null,
          frequency: input.frequency,
          status: 'pending' as const,
          lastCompletedBy: null,
          lastCompletedAt: null,
          totalCompletions: 0,
          createdBy: input.createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
  
        const docRef = await addDoc(choreRef, newChore);
  
        return {
          choreId: docRef.id,
          ...newChore,
        } as ChoreData;
      } catch (error) {
        if (this.isChoreServiceError(error)) {
          throw error;
        }
        throw this.createError(
          ChoreServiceErrorCode.TRANSACTION_FAILED,
          'Failed to add chore. Please try again.',
          error
        );
      }
    }
  
    /**
     * Complete a chore
     * Uses Firebase Transaction to atomically:
     * 1. Update chore status and completion info
     * 2. Increment user's total points
     * 3. Update house choreWeights if needed
     * 
     * @param houseId - ID of the house
     * @param choreId - ID of the chore to complete
     * @param userId - UID of user completing the chore
     * @returns Updated chore data
     * @throws ChoreServiceError on failure
     */
    async completeChore(
      houseId: string,
      choreId: string,
      userId: string
    ): Promise<ChoreData> {
      try {
        // Validate inputs
        if (!houseId || !choreId || !userId) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'House ID, chore ID, and user ID are required'
          );
        }
  
        // Verify user is in the house
        await this.verifyUserInHouse(userId, houseId);
  
        // Use transaction for atomicity
        const choreData = await runTransaction(db, async (transaction) => {
          // Get chore document
          const choreRef = doc(db, 'houses', houseId, 'chores', choreId);
          const choreDoc = await transaction.get(choreRef);
  
          if (!choreDoc.exists()) {
            throw this.createError(
              ChoreServiceErrorCode.CHORE_NOT_FOUND,
              'Chore not found'
            );
          }
  
          const chore = choreDoc.data() as ChoreData;

          if (chore.assignedTo && chore.assignedTo !== userId) {
            throw this.createError(
              ChoreServiceErrorCode.UNAUTHORIZED,
              'You can only complete chores assigned to you.'
            );
          }

          // Update chore document
          transaction.update(choreRef, {
            status: 'completed',
            lastCompletedBy: userId,
            lastCompletedAt: serverTimestamp(),
            totalCompletions: increment(1),
            updatedAt: serverTimestamp(),
          });
  
          // Update user's total points
          const userRef = doc(db, 'users', userId);
          transaction.update(userRef, {
            totalPoints: increment(chore.points),
            updatedAt: serverTimestamp(),
          });
  
          // Return updated chore data
          return {
            ...chore,
            choreId,
            status: 'completed',
            lastCompletedBy: userId,
            lastCompletedAt: Timestamp.now(),
            totalCompletions: chore.totalCompletions + 1,
          } as ChoreData;
        });
  
        try {
          await notificationService.sendAlfredNudge(houseId, userId, 'CHORE_DUE', {
            choreId: choreData.choreId,
            choreName: choreData.title,
            action: 'completed',
          });
        } catch (notifyError) {
          console.error('Failed to send chore-completed notification:', notifyError);
        }

        return choreData;
      } catch (error) {
        if (this.isChoreServiceError(error)) {
          throw error;
        }
        throw this.createError(
          ChoreServiceErrorCode.TRANSACTION_FAILED,
          'Failed to complete chore. Please try again.',
          error
        );
      }
    }
  
    /**
     * Assign a chore to a user
     * 
     * @param houseId - ID of the house
     * @param choreId - ID of the chore
     * @param assignedTo - UID of user to assign (null for unassigned)
     * @param requestingUserId - UID of user making the assignment
     * @throws ChoreServiceError on failure
     */
    async assignChore(
      houseId: string,
      choreId: string,
      assignedTo: string | null,
      requestingUserId: string
    ): Promise<void> {
      try {
        // Validate inputs
        if (!houseId || !choreId || !requestingUserId) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'House ID, chore ID, and requesting user ID are required'
          );
        }
  
        // Verify requesting user is in the house
        await this.verifyUserInHouse(requestingUserId, houseId);
  
        // If assigning to someone, verify they're also in the house
        if (assignedTo) {
          await this.verifyUserInHouse(assignedTo, houseId);
        }
  
        // Fetch chore for notification context
        const choreRef = doc(db, 'houses', houseId, 'chores', choreId);
        const choreDoc = await getDoc(choreRef);
        if (!choreDoc.exists()) {
          throw this.createError(
            ChoreServiceErrorCode.CHORE_NOT_FOUND,
            'Chore not found'
          );
        }
        const chore = choreDoc.data() as ChoreData;

        // Update chore assignment
        await updateDoc(choreRef, {
          assignedTo: assignedTo,
          status: 'pending', // Reset status when reassigned
          updatedAt: serverTimestamp(),
        });

        if (assignedTo) {
          try {
            await notificationService.sendAlfredNudge(houseId, requestingUserId, 'CHORE_DUE', {
              choreId,
              choreName: chore.title,
              assignedTo,
              action: 'assigned',
            });
          } catch (notifyError) {
            console.error('Failed to send chore-assigned notification:', notifyError);
          }
        }
      } catch (error) {
        if (this.isChoreServiceError(error)) {
          throw error;
        }
        throw this.createError(
          ChoreServiceErrorCode.TRANSACTION_FAILED,
          'Failed to assign chore. Please try again.',
          error
        );
      }
    }
  
    /**
     * Unassign a chore (set assignedTo to null)
     * 
     * @param houseId - ID of the house
     * @param choreId - ID of the chore
     * @param requestingUserId - UID of user making the change
     * @throws ChoreServiceError on failure
     */
    async unassignChore(
      houseId: string,
      choreId: string,
      requestingUserId: string
    ): Promise<void> {
      await this.assignChore(houseId, choreId, null, requestingUserId);
    }
  
    /**
     * Update chore details (title, description, points, frequency)
     * 
     * @param houseId - ID of the house
     * @param choreId - ID of the chore
     * @param updates - Fields to update
     * @param userId - UID of user making the update
     * @throws ChoreServiceError on failure
     */
    async updateChore(
      houseId: string,
      choreId: string,
      updates: Partial<Pick<ChoreData, 'title' | 'description' | 'points' | 'frequency'>>,
      userId: string
    ): Promise<void> {
      try {
        // Verify user is in the house
        await this.verifyUserInHouse(userId, houseId);
  
        const choreRef = doc(db, 'houses', houseId, 'chores', choreId);
        await updateDoc(choreRef, {
          ...updates,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        throw this.createError(
          ChoreServiceErrorCode.TRANSACTION_FAILED,
          'Failed to update chore. Please try again.',
          error
        );
      }
    }
  
    /**
     * Delete a chore
     * 
     * @param houseId - ID of the house
     * @param choreId - ID of the chore to delete
     * @param userId - UID of user deleting the chore
     * @throws ChoreServiceError on failure
     */
    async deleteChore(
      houseId: string,
      choreId: string,
      userId: string
    ): Promise<void> {
      try {
        // Verify user is in the house
        await this.verifyUserInHouse(userId, houseId);
  
        const choreRef = doc(db, 'houses', houseId, 'chores', choreId);
        await deleteDoc(choreRef);
      } catch (error) {
        throw this.createError(
          ChoreServiceErrorCode.TRANSACTION_FAILED,
          'Failed to delete chore. Please try again.',
          error
        );
      }
    }
  
    /**
     * Get all chores for a house
     * Returns a one-time snapshot
     * 
     * @param houseId - ID of the house
     * @returns Array of chores
     * @throws ChoreServiceError on failure
     */
    async getHouseChores(houseId: string): Promise<ChoreData[]> {
      try {
        if (!houseId) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'House ID is required'
          );
        }
  
        const choresRef = collection(db, 'houses', houseId, 'chores');
        const q = query(choresRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
  
        return snapshot.docs.map((doc) => ({
          choreId: doc.id,
          ...doc.data(),
        })) as ChoreData[];
      } catch (error) {
        throw this.createError(
          ChoreServiceErrorCode.UNKNOWN_ERROR,
          'Failed to fetch chores.',
          error
        );
      }
    }
  
    /**
     * Subscribe to real-time chore updates for a house
     * 
     * @param houseId - ID of the house
     * @param callback - Function called with updated chores
     * @returns Unsubscribe function
     * @throws ChoreServiceError on failure
     */
    subscribeToHouseChores(
      houseId: string,
      callback: (chores: ChoreData[]) => void
    ): () => void {
      if (!houseId) {
        throw this.createError(
          ChoreServiceErrorCode.INVALID_INPUT,
          'House ID is required'
        );
      }
  
      const choresRef = collection(db, 'houses', houseId, 'chores');
      const q = query(choresRef, orderBy('createdAt', 'desc'));
  
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const chores = snapshot.docs.map((doc) => ({
            choreId: doc.id,
            ...doc.data(),
          })) as ChoreData[];
          callback(chores);
        },
        (error) => {
          console.error('Error in chore subscription:', error);
          callback([]);
        }
      );
  
      return unsubscribe;
    }
  
    /**
     * Get chores assigned to a specific user
     * 
     * @param houseId - ID of the house
     * @param userId - UID of the user
     * @returns Array of assigned chores
     * @throws ChoreServiceError on failure
     */
    async getUserChores(houseId: string, userId: string): Promise<ChoreData[]> {
      try {
        if (!houseId || !userId) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'House ID and user ID are required'
          );
        }
  
        const choresRef = collection(db, 'houses', houseId, 'chores');
        const q = query(
          choresRef,
          where('assignedTo', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
  
        return snapshot.docs.map((doc) => ({
          choreId: doc.id,
          ...doc.data(),
        })) as ChoreData[];
      } catch (error) {
        throw this.createError(
          ChoreServiceErrorCode.UNKNOWN_ERROR,
          'Failed to fetch user chores.',
          error
        );
      }
    }
  
    /**
     * Calculate house fairness metrics
     * Returns average points and each member's deviation from average
     * 
     * @param houseId - ID of the house
     * @returns Object with averagePoints and memberStats
     * @throws ChoreServiceError on failure
     */
    async calculateHouseFairness(houseId: string): Promise<{
      averagePoints: number;
      memberStats: Array<{
        userId: string;
        userName: string;
        totalPoints: number;
        deviation: number; // Positive means above average, negative means below
      }>;
    }> {
      try {
        // Get house data to get members list
        const houseDoc = await getDoc(doc(db, 'houses', houseId));
        if (!houseDoc.exists()) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'House not found'
          );
        }
  
        const members = houseDoc.data().members as string[];
  
        // Get all member data
        const memberStats = await Promise.all(
          members.map(async (userId) => {
            const userDoc = await getDoc(doc(db, 'users', userId));
            const userData = userDoc.data();
            return {
              userId,
              userName: userData?.name || 'Unknown',
              totalPoints: userData?.totalPoints || 0,
              deviation: 0, // Will calculate after getting average
            };
          })
        );
  
        // Calculate average
        const totalPoints = memberStats.reduce((sum, member) => sum + member.totalPoints, 0);
        const averagePoints = members.length > 0 ? totalPoints / members.length : 0;
  
        // Calculate deviations
        memberStats.forEach((member) => {
          member.deviation = member.totalPoints - averagePoints;
        });
  
      return {
        averagePoints,
        memberStats,
      };
    } catch (error) {
      throw this.createError(
        ChoreServiceErrorCode.UNKNOWN_ERROR,
        'Failed to calculate house fairness.',
        error
      );
    }
  }

    async notifyOverdueChores(houseId: string, userId: string): Promise<void> {
      try {
        if (!houseId || !userId) {
          return;
        }

        const chores = await this.getHouseChores(houseId);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const isOverdue = (chore: ChoreData) => {
          if (chore.status === 'completed') {
            return false;
          }
          const lastCompleted = chore.lastCompletedAt?.toDate
            ? chore.lastCompletedAt.toDate()
            : null;
          if (chore.frequency === 'daily') {
            return !lastCompleted || lastCompleted < startOfToday;
          }
          if (chore.frequency === 'weekly') {
            if (!lastCompleted) return true;
            const nextDue = new Date(lastCompleted);
            nextDue.setDate(nextDue.getDate() + 7);
            return nextDue < startOfToday;
          }
          if (chore.frequency === 'one-time') {
            return chore.status === 'pending';
          }
          return false;
        };

        const overdueChores = chores.filter(isOverdue);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        for (const chore of overdueChores) {
          const alreadySent = await notificationService.hasRecentNotification(
            houseId,
            'CHORE_DUE',
            { choreId: chore.choreId },
            since
          );
          if (alreadySent) {
            continue;
          }

          await notificationService.sendAlfredNudge(houseId, userId, 'CHORE_DUE', {
            choreId: chore.choreId,
            choreName: chore.title,
            action: 'overdue',
          });
        }
      } catch (error) {
        console.error('Failed to notify overdue chores:', error);
      }
    }
  
    /**
     * Verify a user is a member of a house
     * 
     * @param userId - UID to verify
     * @param houseId - House ID to check membership
     * @throws ChoreServiceError if user is not in house
     * @private
     */
    private async verifyUserInHouse(userId: string, houseId: string): Promise<void> {
      const houseDoc = await getDoc(doc(db, 'houses', houseId));
      
      if (!houseDoc.exists()) {
        throw this.createError(
          ChoreServiceErrorCode.INVALID_INPUT,
          'House not found'
        );
      }
  
      const members = houseDoc.data().members as string[];
      
      if (!members.includes(userId)) {
        throw this.createError(
          ChoreServiceErrorCode.USER_NOT_IN_HOUSE,
          'You are not a member of this house'
        );
      }
    }
  
    /**
     * Create a ChoreServiceError
     * 
     * @param code - Error code
     * @param message - User-friendly error message
     * @param originalError - Original error (optional)
     * @returns ChoreServiceError
     * @private
     */
    private createError(
      code: ChoreServiceErrorCode,
      message: string,
      originalError?: any
    ): ChoreServiceError {
      return { code, message, originalError };
    }
  
    /**
     * Type guard to check if error is ChoreServiceError
     * 
     * @param error - Error to check
     * @returns true if error is ChoreServiceError
     * @private
     */
    private isChoreServiceError(error: any): error is ChoreServiceError {
      return error && typeof error.code === 'string' && typeof error.message === 'string';
    }
  }
  
  // Export singleton instance
  export default new ChoreService();
