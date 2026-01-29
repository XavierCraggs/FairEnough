// services/houseService.ts
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    runTransaction,
    writeBatch,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    collection,
    query,
    where,
    getDocs,
  } from 'firebase/firestore';
  import { db } from '../api/firebase';
  
  /**
   * House data structure stored in Firestore
   */
export interface HouseData {
  houseId: string;
  name: string;
  inviteCode: string;
  members: string[]; // Array of user UIDs
    createdBy: string; // UID of house creator
    isPremium: boolean;
    premium?: {
      status?: 'active' | 'inactive';
      expiresAt?: any;
      productId?: string;
      platform?: string;
      eventType?: string;
      purchaserUid?: string;
      purchaserName?: string;
      updatedAt?: any;
    };
  choreWeights: Record<string, number>; // { "Scrub Toilet": 10, "Take out bins": 2 }
  choreRotationAvoidRepeat?: boolean;
  choreDensity?: 'comfortable' | 'compact';
  createdAt: any;
  updatedAt: any;
}
  
  /**
   * Invite code document structure
   * Stored in inviteCodes collection for uniqueness validation
   */
  interface InviteCodeData {
    houseId: string;
    createdAt: any;
  }
  
  /**
   * Custom error codes for house service operations
   */
  export enum HouseServiceErrorCode {
    INVALID_CODE = 'INVALID_CODE',
    HOUSE_FULL = 'HOUSE_FULL',
    ALREADY_IN_HOUSE = 'ALREADY_IN_HOUSE',
    NOT_IN_HOUSE = 'NOT_IN_HOUSE',
    UNAUTHORIZED = 'UNAUTHORIZED',
    HOUSE_NOT_FOUND = 'HOUSE_NOT_FOUND',
    CODE_GENERATION_FAILED = 'CODE_GENERATION_FAILED',
    TRANSACTION_FAILED = 'TRANSACTION_FAILED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  }
  
  /**
   * Custom error type for house service
   */
  export interface HouseServiceError {
    code: HouseServiceErrorCode;
    message: string;
    originalError?: any;
  }
  
  /**
   * Constants for house management
   */
  const MAX_FREE_MEMBERS = 8;
  const INVITE_CODE_LENGTH = 6;
  const MAX_CODE_GENERATION_ATTEMPTS = 10;
  
  /**
   * House service for managing house operations
   * Implements atomic transactions to prevent data inconsistencies
   */
  class HouseService {
    /**
     * Resolve a house ID from an invite code
     * 
     * @param inviteCode - House invite code
     * @returns House ID or null if not found
     */
    async resolveHouseIdByInviteCode(inviteCode: string): Promise<string | null> {
      try {
        if (!inviteCode.trim()) {
          return null;
        }
        const normalizedCode = inviteCode.trim().toUpperCase();
        const inviteDoc = await getDoc(doc(db, 'inviteCodes', normalizedCode));
        if (!inviteDoc.exists()) {
          return null;
        }
        const data = inviteDoc.data() as InviteCodeData;
        return data?.houseId || null;
      } catch (error) {
        throw this.createError(
          HouseServiceErrorCode.UNKNOWN_ERROR,
          'Failed to resolve invite code.',
          error
        );
      }
    }
    /**
     * Generate a random invite code
     * Format: 6 alphanumeric characters (e.g., "A7X2Z9")
     * 
     * @returns Random invite code
     * @private
     */
    private generateInviteCode(): string {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0, O, I, 1)
      let code = '';
      
      for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      return code;
    }
  
    /**
     * Check if an invite code is already in use
     * 
     * @param code - Invite code to check
     * @returns true if code is available, false if taken
     * @private
     */
    private async isCodeAvailable(code: string): Promise<boolean> {
      const codeDoc = await getDoc(doc(db, 'inviteCodes', code));
      return !codeDoc.exists();
    }
  
    /**
     * Generate a unique invite code
     * Attempts up to MAX_CODE_GENERATION_ATTEMPTS times
     * 
     * @returns Unique invite code
     * @throws HouseServiceError if unable to generate unique code
     * @private
     */
    private async generateUniqueCode(): Promise<string> {
      for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
        const code = this.generateInviteCode();
        const isAvailable = await this.isCodeAvailable(code);
        
        if (isAvailable) {
          return code;
        }
      }
      
      throw this.createError(
        HouseServiceErrorCode.CODE_GENERATION_FAILED,
        'Unable to generate unique invite code. Please try again.'
      );
    }
  
    /**
     * Create a new house
     * Uses Firebase Transaction to ensure atomicity:
     * 1. Generate unique invite code
     * 2. Create house document
     * 3. Create invite code document
     * 4. Update user's houseId
     * 
     * @param userId - UID of user creating the house
     * @param houseName - Name of the house
     * @returns Created house data
     * @throws HouseServiceError on failure
     */
    async createHouse(userId: string, houseName: string): Promise<HouseData> {
      try {
        // Validate inputs
        if (!userId || !houseName.trim()) {
          throw this.createError(
            HouseServiceErrorCode.TRANSACTION_FAILED,
            'User ID and house name are required'
          );
        }
  
        // Check if user is already in a house
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists() && userDoc.data().houseId) {
          throw this.createError(
            HouseServiceErrorCode.ALREADY_IN_HOUSE,
            'You are already in a house. Leave your current house first.'
          );
        }
  
        // Generate unique invite code
        const inviteCode = await this.generateUniqueCode();
  
        // Use Firestore transaction for atomicity
        const houseData = await runTransaction(db, async (transaction) => {
          // Create house ID (could also use auto-generated ID)
          const houseRef = doc(collection(db, 'houses'));
          const houseId = houseRef.id;
  
          const newHouse: HouseData = {
            houseId,
            name: houseName.trim(),
            inviteCode,
            members: [userId],
            createdBy: userId,
            isPremium: false,
            choreWeights: {}, // Empty initially, can be customized later
            choreRotationAvoidRepeat: true,
            choreDensity: 'comfortable',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
  
          // Create house document
          transaction.set(houseRef, newHouse);
  
          // Create invite code document
          const inviteCodeData: InviteCodeData = {
            houseId,
            createdAt: serverTimestamp(),
          };
          transaction.set(doc(db, 'inviteCodes', inviteCode), inviteCodeData);
  
          // Update user's houseId
          transaction.update(doc(db, 'users', userId), {
            houseId,
            updatedAt: serverTimestamp(),
          });
  
          return newHouse;
        });
  
        return houseData;
      } catch (error) {
        if (this.isHouseServiceError(error)) {
          throw error;
        }
        throw this.createError(
          HouseServiceErrorCode.TRANSACTION_FAILED,
          'Failed to create house. Please try again.',
          error
        );
      }
    }
  
    /**
     * Join an existing house by invite code
     * Uses Firebase Transaction to ensure atomicity:
     * 1. Validate invite code exists
     * 2. Check house member limit
     * 3. Add user to house members
     * 4. Update user's houseId
     * 
     * @param userId - UID of user joining
     * @param inviteCode - House invite code
     * @returns House data
     * @throws HouseServiceError on failure
     */
    async joinHouse(userId: string, inviteCode: string): Promise<HouseData> {
      try {
        // Validate inputs
        if (!userId || !inviteCode.trim()) {
          throw this.createError(
            HouseServiceErrorCode.INVALID_CODE,
            'User ID and invite code are required'
          );
        }
  
        const normalizedCode = inviteCode.trim().toUpperCase();
  
        // Check if user is already in a house
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists() && userDoc.data().houseId) {
          throw this.createError(
            HouseServiceErrorCode.ALREADY_IN_HOUSE,
            'You are already in a house. Leave your current house first.'
          );
        }
  
        // Use Firestore transaction for atomicity
        const houseData = await runTransaction(db, async (transaction) => {
          // Get invite code document
          const inviteCodeDoc = await transaction.get(
            doc(db, 'inviteCodes', normalizedCode)
          );
  
          if (!inviteCodeDoc.exists()) {
            throw this.createError(
              HouseServiceErrorCode.INVALID_CODE,
              'Invalid invite code. Please check and try again.'
            );
          }
  
          const { houseId } = inviteCodeDoc.data() as InviteCodeData;
  
          // Get house document
          const houseDoc = await transaction.get(doc(db, 'houses', houseId));
  
          if (!houseDoc.exists()) {
            throw this.createError(
              HouseServiceErrorCode.HOUSE_NOT_FOUND,
              'House not found. It may have been deleted.'
            );
          }
  
          const house = houseDoc.data() as HouseData;
  
          // Check if user is already a member
          if (house.members.includes(userId)) {
            throw this.createError(
              HouseServiceErrorCode.ALREADY_IN_HOUSE,
              'You are already a member of this house.'
            );
          }
  
          // Check member limit for non-premium houses
          if (!house.isPremium && house.members.length >= MAX_FREE_MEMBERS) {
            throw this.createError(
              HouseServiceErrorCode.HOUSE_FULL,
              `This house is full (${MAX_FREE_MEMBERS} members max). Ask the house admin to upgrade to Premium.`
            );
          }
  
          // Add user to house members
          transaction.update(doc(db, 'houses', houseId), {
            members: arrayUnion(userId),
            updatedAt: serverTimestamp(),
          });
  
          // Update user's houseId
          transaction.update(doc(db, 'users', userId), {
            houseId,
            updatedAt: serverTimestamp(),
          });
  
          // Return updated house data
          return {
            ...house,
            members: [...house.members, userId],
          };
        });
  
        return houseData;
      } catch (error) {
        if (this.isHouseServiceError(error)) {
          throw error;
        }
        throw this.createError(
          HouseServiceErrorCode.TRANSACTION_FAILED,
          'Failed to join house. Please try again.',
          error
        );
      }
    }
  
    /**
     * Leave the current house
     * Uses writeBatch to update both house and user documents
     * 
     * @param userId - UID of user leaving
     * @param houseId - ID of house to leave
     * @throws HouseServiceError on failure
     */
    async leaveHouse(userId: string, houseId: string): Promise<void> {
      try {
        if (!userId || !houseId) {
          throw this.createError(
            HouseServiceErrorCode.NOT_IN_HOUSE,
            'User ID and house ID are required'
          );
        }
  
        // Verify user is in this house
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists() || userDoc.data().houseId !== houseId) {
          throw this.createError(
            HouseServiceErrorCode.NOT_IN_HOUSE,
            'You are not a member of this house.'
          );
        }
  
        // Use batch write for atomicity
        const batch = writeBatch(db);
  
        // Remove user from house members
        batch.update(doc(db, 'houses', houseId), {
          members: arrayRemove(userId),
          updatedAt: serverTimestamp(),
        });
  
        // Clear user's houseId and reset points
        batch.update(doc(db, 'users', userId), {
          houseId: null,
          totalPoints: 0,
          updatedAt: serverTimestamp(),
        });
  
        await batch.commit();
      } catch (error) {
        if (this.isHouseServiceError(error)) {
          throw error;
        }
        throw this.createError(
          HouseServiceErrorCode.TRANSACTION_FAILED,
          'Failed to leave house. Please try again.',
          error
        );
      }
    }
  
    /**
     * Get house data by house ID
     * 
     * @param houseId - ID of house to fetch
     * @returns House data or null if not found
     * @throws HouseServiceError on failure
     */
    async getHouse(houseId: string): Promise<HouseData | null> {
      try {
        if (!houseId) {
          return null;
        }
  
        const houseDoc = await getDoc(doc(db, 'houses', houseId));
        
        if (!houseDoc.exists()) {
          return null;
        }
  
        return houseDoc.data() as HouseData;
      } catch (error) {
        throw this.createError(
          HouseServiceErrorCode.UNKNOWN_ERROR,
          'Failed to fetch house data.',
          error
        );
      }
    }
  
    /**
     * Update house name
     * Only house creator can update the name
     * 
     * @param houseId - ID of house to update
     * @param userId - UID of user making the update
     * @param newName - New house name
     * @throws HouseServiceError on failure
     */
    async updateHouseName(
      houseId: string,
      userId: string,
      newName: string
    ): Promise<void> {
      try {
        if (!houseId || !userId || !newName.trim()) {
          throw this.createError(
            HouseServiceErrorCode.TRANSACTION_FAILED,
            'House ID, user ID, and new name are required'
          );
        }
  
        const houseDoc = await getDoc(doc(db, 'houses', houseId));
        
        if (!houseDoc.exists()) {
          throw this.createError(
            HouseServiceErrorCode.HOUSE_NOT_FOUND,
            'House not found.'
          );
        }
  
        const house = houseDoc.data() as HouseData;
  
        // Verify user is the creator
        if (house.createdBy !== userId) {
          throw this.createError(
            HouseServiceErrorCode.UNAUTHORIZED,
            'Only the house creator can change the house name.'
          );
        }
  
        await updateDoc(doc(db, 'houses', houseId), {
          name: newName.trim(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (this.isHouseServiceError(error)) {
          throw error;
        }
        throw this.createError(
          HouseServiceErrorCode.UNKNOWN_ERROR,
          'Failed to update house name.',
          error
        );
      }
    }
  
    /**
     * Update chore weights for a house
     * 
     * @param houseId - ID of house to update
     * @param choreWeights - New chore weights object
     * @throws HouseServiceError on failure
     */
    async updateChoreWeights(
      houseId: string,
      choreWeights: Record<string, number>
    ): Promise<void> {
      try {
        if (!houseId) {
          throw this.createError(
            HouseServiceErrorCode.TRANSACTION_FAILED,
            'House ID is required'
          );
        }
  
        await updateDoc(doc(db, 'houses', houseId), {
          choreWeights,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        throw this.createError(
          HouseServiceErrorCode.UNKNOWN_ERROR,
          'Failed to update chore weights.',
          error
        );
      }
    }

    /**
     * Update house-level preferences
     */
    async updateHousePreferences(
      houseId: string,
      userId: string,
      preferences: {
        choreRotationAvoidRepeat?: boolean;
        choreDensity?: 'comfortable' | 'compact';
      }
    ): Promise<void> {
      try {
        if (!houseId || !userId) {
          throw this.createError(
            HouseServiceErrorCode.TRANSACTION_FAILED,
            'House ID and user ID are required'
          );
        }

        await this.verifyUserInHouse(userId, houseId);

        await updateDoc(doc(db, 'houses', houseId), {
          ...preferences,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        throw this.createError(
          HouseServiceErrorCode.UNKNOWN_ERROR,
          'Failed to update house preferences.',
          error
        );
      }
    }
  
    /**
     * Create a HouseServiceError
     * 
     * @param code - Error code
     * @param message - User-friendly error message
     * @param originalError - Original error (optional)
     * @returns HouseServiceError
     * @private
     */
    private createError(
      code: HouseServiceErrorCode,
      message: string,
      originalError?: any
    ): HouseServiceError {
      return { code, message, originalError };
    }

    private async verifyUserInHouse(userId: string, houseId: string): Promise<void> {
      const houseDoc = await getDoc(doc(db, 'houses', houseId));

      if (!houseDoc.exists()) {
        throw this.createError(
          HouseServiceErrorCode.HOUSE_NOT_FOUND,
          'House not found.'
        );
      }

      const members = (houseDoc.data().members || []) as string[];
      if (!members.includes(userId)) {
        throw this.createError(
          HouseServiceErrorCode.NOT_IN_HOUSE,
          'You are not a member of this house.'
        );
      }
    }
  
    /**
     * Type guard to check if error is HouseServiceError
     * 
     * @param error - Error to check
     * @returns true if error is HouseServiceError
     * @private
     */
    private isHouseServiceError(error: any): error is HouseServiceError {
      return error && typeof error.code === 'string' && typeof error.message === 'string';
    }
  }
  
  // Export singleton instance
  export default new HouseService();
