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
import {
  adjustAssignmentLoad,
  buildAssignmentLoad,
  isPendingStatus,
  selectFairAssignee,
} from '../utils/choreAssignment';

  export const ROLLING_WINDOW_DAYS = 28;

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const addDays = (date: Date, days: number) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

  const addMonths = (date: Date, months: number) => {
    const year = date.getFullYear();
    const month = date.getMonth() + months;
    const day = date.getDate();
    const firstOfTargetMonth = new Date(year, month, 1);
    const lastDay = new Date(
      firstOfTargetMonth.getFullYear(),
      firstOfTargetMonth.getMonth() + 1,
      0
    ).getDate();
    return new Date(
      firstOfTargetMonth.getFullYear(),
      firstOfTargetMonth.getMonth(),
      Math.min(day, lastDay)
    );
  };

  const buildLastCompletedMap = (chores: ChoreData[]) => {
    const map = new Map<string, number>();
    chores.forEach((chore) => {
      if (!chore.lastCompletedBy || !chore.lastCompletedAt?.toDate) {
        return;
      }
      const completedAt = chore.lastCompletedAt.toDate().getTime();
      const current = map.get(chore.lastCompletedBy) ?? 0;
      if (completedAt > current) {
        map.set(chore.lastCompletedBy, completedAt);
      }
    });
    return map;
  };
  
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
    frequency: 'daily' | 'weekly' | 'monthly' | 'one-time';
    status: 'pending' | 'completed' | 'overdue';
    lastCompletedBy: string | null; // UID of last user who completed it
    lastCompletedAt: Timestamp | null;
    nextDueAt?: Timestamp | null;
    assignmentMode?: 'fair' | 'weeklyLock';
    lockStartAt?: Timestamp | null;
    lockDurationDays?: number | null;
    eligibleAssignees?: string[] | null;
    missedCount?: number;
    lastMissedAt?: Timestamp | null;
    totalCompletions: number; // Track how many times this chore has been done
    createdBy: string;
    createdAt: any;
    updatedAt: any;
  }

  export interface ChoreCompletion {
    completionId: string;
    choreId: string;
    choreTitle: string;
    houseId: string;
    userId: string;
    points: number;
    completedAt: Timestamp;
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
    frequency: 'daily' | 'weekly' | 'monthly' | 'one-time';
    dueDate?: Date;
    createdBy: string;
    assignmentMode?: 'fair' | 'weeklyLock';
    lockDurationDays?: number;
    eligibleAssignees?: string[] | null;
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
        if (!input.houseId || !input.title.trim() || !this.isValidPoints(input.points)) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'House ID, title, and a difficulty score between 1 and 10 are required'
          );
        }
  
        // Verify house exists and user is a member
        await this.verifyUserInHouse(input.createdBy, input.houseId);
  
        // Create chore document
        const choreRef = collection(db, 'houses', input.houseId, 'chores');
        const now = new Date();
        const dueDate = input.dueDate ? startOfDay(input.dueDate) : startOfDay(now);
        const assignmentMode = input.assignmentMode ?? 'fair';
        const lockDurationDays =
          assignmentMode === 'weeklyLock' ? input.lockDurationDays ?? 7 : null;

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
          nextDueAt: Timestamp.fromDate(dueDate),
          assignmentMode,
          lockStartAt:
            assignmentMode === 'weeklyLock' && input.assignedTo
              ? Timestamp.fromDate(startOfDay(now))
              : null,
          lockDurationDays,
          eligibleAssignees: input.eligibleAssignees ?? null,
          missedCount: 0,
          lastMissedAt: null,
          totalCompletions: 0,
          createdBy: input.createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
  
        const docRef = await addDoc(choreRef, newChore);
  
        let assignedTo = newChore.assignedTo;
        if (!assignedTo) {
          const autoAssignee = await this.pickFairAssignee(input.houseId, null);
          if (autoAssignee) {
            const lockStartAt =
              assignmentMode === 'weeklyLock'
                ? Timestamp.fromDate(startOfDay(now))
                : null;
            await updateDoc(docRef, {
              assignedTo: autoAssignee,
              lockStartAt,
              updatedAt: serverTimestamp(),
            });
            assignedTo = autoAssignee;
          }
        }

        return {
          choreId: docRef.id,
          ...newChore,
          assignedTo,
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
        const completedAt = new Date();
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

          const nextDueAt =
            chore.frequency === 'one-time'
              ? null
              : this.getNextDueTimestamp(chore.frequency, completedAt);

          // Update chore document
          transaction.update(choreRef, {
            status: 'completed',
            lastCompletedBy: userId,
            lastCompletedAt: serverTimestamp(),
            totalCompletions: increment(1),
            missedCount: 0,
            lastMissedAt: null,
            updatedAt: serverTimestamp(),
            nextDueAt,
          });

          // Update user's total points
          const userRef = doc(db, 'users', userId);
          transaction.update(userRef, {
            totalPoints: increment(chore.points),
            updatedAt: serverTimestamp(),
          });

          const completionRef = doc(
            collection(db, 'houses', houseId, 'choreCompletions')
          );
          transaction.set(completionRef, {
            houseId,
            choreId,
            choreTitle: chore.title,
            userId,
            points: chore.points,
            completedAt: serverTimestamp(),
          });
  
          // Return updated chore data
          return {
            ...chore,
            choreId,
            status: 'completed',
            lastCompletedBy: userId,
            lastCompletedAt: Timestamp.now(),
            totalCompletions: chore.totalCompletions + 1,
            nextDueAt: nextDueAt ?? null,
          } as ChoreData;
        });

        if (choreData.frequency !== 'one-time' && choreData.assignmentMode !== 'weeklyLock') {
          await this.assignChoreByFairness(houseId, choreId, {
            excludeUserId: userId,
          });
        }
  
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
        const lockStartAt =
          chore.assignmentMode === 'weeklyLock'
            ? Timestamp.fromDate(startOfDay(new Date()))
            : null;
        await updateDoc(choreRef, {
          assignedTo: assignedTo,
          status: 'pending', // Reset status when reassigned
          lockStartAt: lockStartAt ?? chore.lockStartAt ?? null,
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
      updates: Partial<
        Pick<
          ChoreData,
          | 'title'
          | 'description'
          | 'points'
          | 'frequency'
          | 'assignmentMode'
          | 'lockDurationDays'
          | 'eligibleAssignees'
        > & {
          dueDate?: Date;
        }
      >,
      userId: string
    ): Promise<void> {
      try {
        // Verify user is in the house
        await this.verifyUserInHouse(userId, houseId);

        const choreRef = doc(db, 'houses', houseId, 'chores', choreId);
        if (typeof updates.points === 'number' && !this.isValidPoints(updates.points)) {
          throw this.createError(
            ChoreServiceErrorCode.INVALID_INPUT,
            'Difficulty score must be between 1 and 10.'
          );
        }

        const patch: any = {
          ...updates,
          updatedAt: serverTimestamp(),
        };

        if (updates.assignmentMode === 'weeklyLock') {
          patch.lockDurationDays = updates.lockDurationDays ?? 7;
          patch.lockStartAt = Timestamp.fromDate(startOfDay(new Date()));
        }
        if (updates.assignmentMode === 'fair') {
          patch.lockStartAt = null;
          patch.lockDurationDays = null;
        }

        if (updates.dueDate) {
          patch.nextDueAt = Timestamp.fromDate(startOfDay(updates.dueDate));
        } else if (updates.frequency) {
          const choreDoc = await getDoc(choreRef);
          const chore = choreDoc.data() as ChoreData | undefined;
          const referenceDate =
            chore?.lastCompletedAt?.toDate?.() || new Date();
          patch.nextDueAt =
            updates.frequency === 'one-time'
              ? null
              : this.getNextDueTimestamp(updates.frequency, referenceDate);
        }

        await updateDoc(choreRef, patch);
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
      windowDays: number;
    }> {
      try {
        const members = await this.getHouseMembers(houseId);
        const since = addDays(new Date(), -ROLLING_WINDOW_DAYS);
        const pointsMap = await this.getRollingPointsMap(houseId, since);

        const memberStats = await Promise.all(
          members.map(async (userId) => {
            const userDoc = await getDoc(doc(db, 'users', userId));
            const userData = userDoc.data();
            const rollingPoints = pointsMap.get(userId) ?? 0;
            return {
              userId,
              userName: userData?.name || 'Unknown',
              totalPoints: rollingPoints,
              deviation: 0,
            };
          })
        );

        const totalPoints = memberStats.reduce((sum, member) => sum + member.totalPoints, 0);
        const averagePoints = members.length > 0 ? totalPoints / members.length : 0;

        memberStats.forEach((member) => {
          member.deviation = member.totalPoints - averagePoints;
        });

        return {
          averagePoints,
          memberStats,
          windowDays: ROLLING_WINDOW_DAYS,
        };
      } catch (error) {
        throw this.createError(
          ChoreServiceErrorCode.UNKNOWN_ERROR,
          'Failed to calculate house fairness.',
          error
        );
      }
    }

    async autoAssignDueChores(houseId: string, userId: string): Promise<void> {
      try {
        if (!houseId || !userId) return;

        await this.verifyUserInHouse(userId, houseId);
        const houseDoc = await getDoc(doc(db, 'houses', houseId));
        const houseData = houseDoc.data() as {
          members?: string[];
          isPremium?: boolean;
          choreRotationAvoidRepeat?: boolean;
        } | undefined;
        const members = houseData?.members ?? [];
        const avoidRepeat = houseData?.choreRotationAvoidRepeat !== false;
        const isPremium = !!houseData?.isPremium;
        if (!members.length) return;

        const since = addDays(new Date(), -ROLLING_WINDOW_DAYS);
        const pointsMap = await this.getRollingPointsMap(houseId, since);
        const chores = await this.getHouseChores(houseId);
        const orderedMembers = [...members].sort((a, b) => a.localeCompare(b));
        const assignmentLoad = buildAssignmentLoad(chores);
        const lastCompletedMap = buildLastCompletedMap(chores);
        const today = startOfDay(new Date());

        const batch = writeBatch(db);
        let updates = 0;

        const choresWithDue = chores.map((chore) => {
          const dueDate = this.getChoreDueDate(chore, today);
          const isDue = dueDate ? dueDate <= today : chore.status !== 'completed';
          return { chore, dueDate, isDue };
        });

        choresWithDue
          .sort((a, b) => {
            const aCreated = a.chore.createdAt?.toDate
              ? a.chore.createdAt.toDate().getTime()
              : 0;
            const bCreated = b.chore.createdAt?.toDate
              ? b.chore.createdAt.toDate().getTime()
              : 0;
            if (aCreated !== bCreated) return aCreated - bCreated;
            return a.chore.choreId.localeCompare(b.chore.choreId);
          })
          .forEach(({ chore, dueDate, isDue }) => {
          if (chore.frequency === 'one-time' && chore.status === 'completed') {
            return;
          }

          const assignmentMode = chore.assignmentMode ?? 'fair';
          const weeklyLockEnabled = assignmentMode === 'weeklyLock' && isPremium;
          const shouldDowngradeWeeklyLock = assignmentMode === 'weeklyLock' && !isPremium;
          const lockDurationDays = chore.lockDurationDays ?? 7;
          const lockStartAt = chore.lockStartAt?.toDate
            ? startOfDay(chore.lockStartAt.toDate())
            : null;
          const lockExpiresAt = lockStartAt ? addDays(lockStartAt, lockDurationDays) : null;
          const lockExpired = weeklyLockEnabled && lockExpiresAt && lockExpiresAt <= today;
          const eligibleMembersRaw =
            chore.eligibleAssignees && chore.eligibleAssignees.length
              ? orderedMembers.filter((memberId) =>
                  chore.eligibleAssignees?.includes(memberId)
                )
              : orderedMembers;
          const eligibleMembers = eligibleMembersRaw.length
            ? eligibleMembersRaw
            : orderedMembers;

          const shouldAssign =
            isDue &&
            !chore.assignedTo &&
            (!weeklyLockEnabled || !chore.assignedTo);

          let targetAssignee = chore.assignedTo;

          if (weeklyLockEnabled) {
            if (!targetAssignee) {
              targetAssignee = this.pickFairAssigneeFromList(
                eligibleMembers,
                pointsMap,
                assignmentLoad,
                null,
                lastCompletedMap
              );
            } else if (lockExpired) {
              const excludeUser =
                avoidRepeat && eligibleMembers.length > 1 ? targetAssignee : null;
              targetAssignee = this.pickFairAssigneeFromList(
                eligibleMembers,
                pointsMap,
                assignmentLoad,
                excludeUser,
                lastCompletedMap
              );
            }
          } else if (shouldAssign) {
            targetAssignee = this.pickFairAssigneeFromList(
              eligibleMembers,
              pointsMap,
              assignmentLoad,
              chore.lastCompletedBy ?? null,
              lastCompletedMap
            );
          }

          const nextDueAt =
            chore.nextDueAt ?? (dueDate ? Timestamp.fromDate(dueDate) : null);

          const nextStatus = isDue ? 'pending' : chore.status;

          const shouldMarkMissed =
            chore.frequency === 'daily' &&
            isDue &&
            nextStatus === 'pending' &&
            dueDate &&
            dueDate < today;
          const lastMissedAt = chore.lastMissedAt?.toDate
            ? startOfDay(chore.lastMissedAt.toDate())
            : null;
          const missedDays = shouldMarkMissed
            ? Math.max(
                0,
                Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
              )
            : 0;
          const shouldIncrementMissed =
            missedDays > 0 && (!lastMissedAt || lastMissedAt.getTime() !== today.getTime());

          if (
            targetAssignee !== chore.assignedTo ||
            nextStatus !== chore.status ||
            (nextDueAt && !chore.nextDueAt) ||
            shouldIncrementMissed ||
            (weeklyLockEnabled && (!lockStartAt || lockExpired))
          ) {
            const choreRef = doc(db, 'houses', houseId, 'chores', chore.choreId);
            const lockStartPayload =
              weeklyLockEnabled && (!lockStartAt || lockExpired)
                ? Timestamp.fromDate(startOfDay(new Date()))
                : chore.lockStartAt ?? null;

            const patch: any = {
              assignedTo: targetAssignee ?? null,
              status: nextStatus,
              nextDueAt: nextDueAt ?? null,
              updatedAt: serverTimestamp(),
            };

            if (weeklyLockEnabled) {
              patch.lockStartAt = lockStartPayload;
              patch.lockDurationDays = lockDurationDays;
            }
            if (shouldDowngradeWeeklyLock) {
              patch.assignmentMode = 'fair';
              patch.lockStartAt = null;
              patch.lockDurationDays = null;
            }

            if (shouldIncrementMissed) {
              patch.missedCount = increment(missedDays);
              patch.lastMissedAt = serverTimestamp();
              patch.nextDueAt = Timestamp.fromDate(today);
            }

            batch.update(choreRef, patch);
            updates += 1;
          }

          if (shouldAssign || (weeklyLockEnabled && targetAssignee !== chore.assignedTo)) {
            const chorePoints = Number.isFinite(chore.points) ? chore.points : 0;
            const wasCounted =
              !!chore.assignedTo && isPendingStatus(chore.status);
            const willCount =
              !!targetAssignee && isPendingStatus(nextStatus);

            if (wasCounted && (!willCount || targetAssignee !== chore.assignedTo)) {
              adjustAssignmentLoad(
                assignmentLoad,
                chore.assignedTo,
                -1,
                -chorePoints
              );
            }
            if (willCount && (!wasCounted || targetAssignee !== chore.assignedTo)) {
              adjustAssignmentLoad(
                assignmentLoad,
                targetAssignee,
                1,
                chorePoints
              );
            }
          }
        });

        if (updates > 0) {
          await batch.commit();
        }
      } catch (error) {
        console.error('Failed to auto-assign due chores:', error);
      }
    }

    async assignChoreByFairness(
      houseId: string,
      choreId: string,
      options?: { excludeUserId?: string }
    ): Promise<void> {
      const members = await this.getHouseMembers(houseId);
      if (!members.length) return;

      const since = addDays(new Date(), -ROLLING_WINDOW_DAYS);
      const pointsMap = await this.getRollingPointsMap(houseId, since);
      const chores = await this.getHouseChores(houseId);
      const assignmentLoad = buildAssignmentLoad(chores);
      const lastCompletedMap = buildLastCompletedMap(chores);
      const choreRef = doc(db, 'houses', houseId, 'chores', choreId);
      const choreDoc = await getDoc(choreRef);
      if (!choreDoc.exists()) return;
      const chore = choreDoc.data() as ChoreData;

      const eligibleMembersRaw =
        chore.eligibleAssignees && chore.eligibleAssignees.length
          ? members.filter((memberId) => chore.eligibleAssignees?.includes(memberId))
          : members;
      const eligibleMembers = eligibleMembersRaw.length ? eligibleMembersRaw : members;

      const target = this.pickFairAssigneeFromList(
        eligibleMembers,
        pointsMap,
        assignmentLoad,
        options?.excludeUserId ?? null,
        lastCompletedMap
      );
      if (!target) return;
      if (chore.assignedTo === target) return;

      await updateDoc(choreRef, {
        assignedTo: target,
        updatedAt: serverTimestamp(),
      });
    }

    /**
     * End a recurring chore series (keeps history, stops future repeats)
     */
    async endChoreSeries(
      houseId: string,
      choreId: string,
      userId: string
    ): Promise<void> {
      try {
        await this.verifyUserInHouse(userId, houseId);
        const choreRef = doc(db, 'houses', houseId, 'chores', choreId);
        await updateDoc(choreRef, {
          frequency: 'one-time',
          status: 'completed',
          nextDueAt: null,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        throw this.createError(
          ChoreServiceErrorCode.TRANSACTION_FAILED,
          'Failed to end chore series. Please try again.',
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
        const today = startOfDay(new Date());

        const isOverdue = (chore: ChoreData) => {
          if (chore.status === 'completed' && chore.frequency !== 'one-time') {
            const dueDate = this.getChoreDueDate(chore, today);
            return dueDate ? dueDate < today : false;
          }
          if (chore.status === 'completed') {
            return false;
          }
          const dueDate = this.getChoreDueDate(chore, today);
          return dueDate ? dueDate < today : false;
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

    private isValidPoints(points: number): boolean {
      return Number.isFinite(points) && points >= 1 && points <= 10;
    }

    private getNextDueTimestamp(
      frequency: ChoreData['frequency'],
      referenceDate: Date
    ): Timestamp | null {
      const base = startOfDay(referenceDate);
      if (frequency === 'daily') {
        return Timestamp.fromDate(addDays(base, 1));
      }
      if (frequency === 'weekly') {
        return Timestamp.fromDate(addDays(base, 7));
      }
      if (frequency === 'monthly') {
        return Timestamp.fromDate(addMonths(base, 1));
      }
      return null;
    }

    private getChoreDueDate(chore: ChoreData, referenceDate: Date): Date | null {
      if (chore.nextDueAt?.toDate) {
        return startOfDay(chore.nextDueAt.toDate());
      }
      if (chore.frequency === 'one-time') {
        return chore.status === 'completed' ? null : startOfDay(referenceDate);
      }
      if (chore.lastCompletedAt?.toDate) {
        const lastCompleted = startOfDay(chore.lastCompletedAt.toDate());
        if (chore.frequency === 'daily') {
          return addDays(lastCompleted, 1);
        }
        if (chore.frequency === 'weekly') {
          return addDays(lastCompleted, 7);
        }
        if (chore.frequency === 'monthly') {
          return addMonths(lastCompleted, 1);
        }
      }
      if (chore.createdAt?.toDate) {
        return startOfDay(chore.createdAt.toDate());
      }
      return startOfDay(referenceDate);
    }

    private async getRollingPointsMap(
      houseId: string,
      sinceDate: Date
    ): Promise<Map<string, number>> {
      const pointsMap = new Map<string, number>();
      const completionsRef = collection(db, 'houses', houseId, 'choreCompletions');
      const q = query(
        completionsRef,
        where('completedAt', '>=', Timestamp.fromDate(sinceDate)),
        orderBy('completedAt', 'desc')
      );
      const snapshot = await getDocs(q);

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as ChoreCompletion;
        const current = pointsMap.get(data.userId) ?? 0;
        pointsMap.set(data.userId, current + (data.points || 0));
      });

      return pointsMap;
    }

    private async getHouseMembers(houseId: string): Promise<string[]> {
      const houseDoc = await getDoc(doc(db, 'houses', houseId));
      if (!houseDoc.exists()) {
        throw this.createError(
          ChoreServiceErrorCode.INVALID_INPUT,
          'House not found'
        );
      }

      const members = houseDoc.data().members as string[] | undefined;
      return members ?? [];
    }

    private pickFairAssigneeFromList(
      members: string[],
      pointsMap: Map<string, number>,
      assignmentLoad: Map<string, { count: number; points: number }>,
      excludeUserId: string | null,
      lastCompletedMap?: Map<string, number>
    ): string | null {
      return selectFairAssignee(
        members,
        pointsMap,
        assignmentLoad,
        excludeUserId,
        lastCompletedMap
      );
    }

    private async pickFairAssignee(
      houseId: string,
      excludeUserId: string | null
    ): Promise<string | null> {
      const members = await this.getHouseMembers(houseId);
      if (!members.length) return null;
      const since = addDays(new Date(), -ROLLING_WINDOW_DAYS);
      const pointsMap = await this.getRollingPointsMap(houseId, since);
      const chores = await this.getHouseChores(houseId);
      const assignmentLoad = buildAssignmentLoad(chores);
      const lastCompletedMap = buildLastCompletedMap(chores);
      return this.pickFairAssigneeFromList(
        members,
        pointsMap,
        assignmentLoad,
        excludeUserId,
        lastCompletedMap
      );
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
