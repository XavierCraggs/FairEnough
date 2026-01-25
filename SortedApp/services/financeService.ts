// services/financeService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  deleteDoc,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../api/firebase';
import notificationService from './notificationService';
import { calculateSimplifiedDebts } from '../utils/finance';

/**
 * Transaction data structure stored in Firestore
 */
export interface TransactionData {
  transactionId: string;
  houseId: string;
  payerId: string;
  payerName: string;
  amount: number;
  description: string;
  splitWith: string[];
  splitAmounts?: Record<string, number> | null;
  paidBy?: Record<string, number>;
  confirmedBy: string[];
  contestedBy?: string[];
  contestNotes?: Record<string, { reason: string; note?: string; createdAt: Timestamp }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SettlementData {
  settlementId: string;
  houseId: string;
  from: string;
  to: string;
  amount: number;
  createdBy: string;
  note?: string;
  createdAt: Timestamp;
}

/**
 * Simplified debt output structure
 */
export interface SimplifiedDebt {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

/**
 * Custom error codes for finance service operations
 */
export enum FinanceServiceErrorCode {
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_INPUT = 'INVALID_INPUT',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  USER_NOT_IN_HOUSE = 'USER_NOT_IN_HOUSE',
  HOUSE_NOT_FOUND = 'HOUSE_NOT_FOUND',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom error type for finance service
 */
export interface FinanceServiceError {
  code: FinanceServiceErrorCode;
  message: string;
  originalError?: any;
}


/**
 * Finance service for managing house transactions and debts
 */
class FinanceService {
  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private computeSplitValues(transaction: TransactionData): Record<string, number> {
    const splitWith = transaction.splitWith || [];
    if (!splitWith.length) return {};
    const amount = Number(transaction.amount) || 0;
    if (!amount) return {};

    if (transaction.splitAmounts) {
      const totalSplit = splitWith.reduce((sum, memberId) => {
        const value = Number(transaction.splitAmounts?.[memberId]);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);

      if (totalSplit > 0) {
        const scale = Math.abs(totalSplit - amount) > 0.01 ? amount / totalSplit : 1;
        return splitWith.reduce<Record<string, number>>((acc, memberId) => {
          const value = Number(transaction.splitAmounts?.[memberId]);
          acc[memberId] = Number.isFinite(value)
            ? this.roundCurrency(value * scale)
            : 0;
          return acc;
        }, {});
      }
    }

    const share = amount / splitWith.length;
    return splitWith.reduce<Record<string, number>>((acc, memberId) => {
      acc[memberId] = this.roundCurrency(share);
      return acc;
    }, {});
  }

  private async applySettlementAllocation(
    houseId: string,
    from: string,
    to: string,
    amount: number
  ) {
    const transactionsRef = collection(db, 'houses', houseId, 'transactions');
    const q = query(
      transactionsRef,
      where('payerId', '==', to),
      where('splitWith', 'array-contains', from),
      orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    let remaining = this.roundCurrency(amount);
    const batch = writeBatch(db);
    let updates = 0;

    snapshot.docs.forEach((docSnap) => {
      if (remaining <= 0) return;
      const data = docSnap.data() as TransactionData;
      const splitValues = this.computeSplitValues(data);
      const share = splitValues[from] ?? 0;
      if (share <= 0) return;
      const paidBy = { ...(data.paidBy || {}) };
      const alreadyPaid = Number(paidBy[from]) || 0;
      const unpaid = this.roundCurrency(share - alreadyPaid);
      if (unpaid <= 0) return;
      const allocation = Math.min(remaining, unpaid);
      paidBy[from] = this.roundCurrency(alreadyPaid + allocation);
      remaining = this.roundCurrency(remaining - allocation);
      batch.update(docSnap.ref, {
        paidBy,
        updatedAt: serverTimestamp(),
      });
      updates += 1;
    });

    if (updates > 0) {
      await batch.commit();
    }
  }
  /**
   * Add a new transaction to a house
   */
  async addTransaction(
    houseId: string,
    payerId: string,
    amount: number,
    description: string,
    splitWith: string[],
    splitAmounts?: Record<string, number> | null
  ): Promise<TransactionData> {
    try {
      if (!houseId || !payerId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID and payer ID are required.'
        );
      }

      if (!Number.isFinite(amount) || amount < 0) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'Amount must be a valid number (0 or more).'
        );
      }

      const normalizedSplit = Array.from(
        new Set((splitWith || []).filter((id) => !!id))
      );
      if (!normalizedSplit.length) {
        normalizedSplit.push(payerId);
      }
      if (!normalizedSplit.includes(payerId)) {
        normalizedSplit.push(payerId);
      }

      await this.verifyUserInHouse(payerId, houseId);

      const transactionData = await runTransaction(db, async (transaction) => {
        const houseRef = doc(db, 'houses', houseId);
        const houseDoc = await transaction.get(houseRef);

        if (!houseDoc.exists()) {
          throw this.createError(
            FinanceServiceErrorCode.HOUSE_NOT_FOUND,
            'House not found.'
          );
        }

        const members = (houseDoc.data().members || []) as string[];
        const invalidSplitMember = normalizedSplit.find(
          (memberId) => !members.includes(memberId)
        );

        if (invalidSplitMember) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'One or more split members are not in this house.'
          );
        }

        const payerDoc = await transaction.get(doc(db, 'users', payerId));
        const payerName = payerDoc.exists()
          ? (payerDoc.data().name as string) || 'Unknown'
          : 'Unknown';

        const transactionsRef = collection(db, 'houses', houseId, 'transactions');
        const newTransactionRef = doc(transactionsRef);
        const normalizedSplitAmounts = this.normalizeSplitAmounts(
          splitAmounts,
          normalizedSplit,
          amount
        );

        const newTransaction = {
          houseId,
          payerId,
          payerName,
          amount: Math.round(amount * 100) / 100,
          description: description.trim(),
          splitWith: normalizedSplit,
          confirmedBy: [payerId],
          contestedBy: [],
          contestNotes: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (normalizedSplitAmounts) {
          (newTransaction as TransactionData).splitAmounts = normalizedSplitAmounts;
        }

        transaction.set(newTransactionRef, newTransaction);

        return {
          transactionId: newTransactionRef.id,
          ...newTransaction,
        } as TransactionData;
      });

      try {
        await notificationService.sendAlfredNudge(houseId, payerId, 'BILL_ADDED', {
          amount: transactionData.amount,
          description: transactionData.description,
          transactionId: transactionData.transactionId,
        });
      } catch (notifyError) {
        console.error('Failed to send bill-added notification:', notifyError);
      }

      return transactionData;
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.TRANSACTION_FAILED,
        'Failed to add transaction. Please try again.',
        error
      );
    }
  }

  /**
   * Update an existing transaction
   */
  async updateTransaction(
    houseId: string,
    transactionId: string,
    userId: string,
    updates: {
      amount: number;
      description: string;
      splitWith: string[];
      splitAmounts?: Record<string, number> | null;
    }
  ): Promise<TransactionData> {
    try {
      if (!houseId || !transactionId || !userId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID, transaction ID, and user ID are required.'
        );
      }

      if (!Number.isFinite(updates.amount) || updates.amount < 0) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'Amount must be a valid number (0 or more).'
        );
      }

      const normalizedSplit = Array.from(
        new Set((updates.splitWith || []).filter((id) => !!id))
      );
      if (!normalizedSplit.length) {
        normalizedSplit.push(userId);
      }
      if (!normalizedSplit.includes(userId)) {
        normalizedSplit.push(userId);
      }

      await this.verifyUserInHouse(userId, houseId);

      const updatedTransaction = await runTransaction(db, async (transaction) => {
        const transactionRef = doc(db, 'houses', houseId, 'transactions', transactionId);
        const transactionDoc = await transaction.get(transactionRef);

        if (!transactionDoc.exists()) {
          throw this.createError(
            FinanceServiceErrorCode.TRANSACTION_NOT_FOUND,
            'Transaction not found.'
          );
        }

        const current = transactionDoc.data() as TransactionData;
        if (current.payerId !== userId) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'Only the payer can edit this transaction.'
          );
        }

        const houseRef = doc(db, 'houses', houseId);
        const houseDoc = await transaction.get(houseRef);
        if (!houseDoc.exists()) {
          throw this.createError(
            FinanceServiceErrorCode.HOUSE_NOT_FOUND,
            'House not found.'
          );
        }

        const members = (houseDoc.data().members || []) as string[];
        const invalidSplitMember = normalizedSplit.find(
          (memberId) => !members.includes(memberId)
        );
        if (invalidSplitMember) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'One or more split members are not in this house.'
          );
        }

        const normalizedSplitAmounts = this.normalizeSplitAmounts(
          updates.splitAmounts,
          normalizedSplit,
          updates.amount
        );

        const payload: Partial<TransactionData> = {
          amount: Math.round(updates.amount * 100) / 100,
          description: updates.description.trim(),
          splitWith: normalizedSplit,
          confirmedBy: [userId],
          contestedBy: [],
          contestNotes: {},
          updatedAt: serverTimestamp(),
        };

        if (typeof updates.splitAmounts !== 'undefined') {
          payload.splitAmounts = normalizedSplitAmounts ?? null;
        }

        transaction.update(transactionRef, payload);

        return {
          ...current,
          ...payload,
          transactionId,
        } as TransactionData;
      });

      return updatedTransaction;
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.TRANSACTION_FAILED,
        'Failed to update transaction. Please try again.',
        error
      );
    }
  }

  /**
   * Fetch all transactions for a house
   */
  async getHouseTransactions(houseId: string): Promise<TransactionData[]> {
    try {
      if (!houseId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID is required.'
        );
      }

      const transactionsRef = collection(db, 'houses', houseId, 'transactions');
      const q = query(transactionsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        transactionId: docSnap.id,
        ...docSnap.data(),
      })) as TransactionData[];
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.UNKNOWN_ERROR,
        'Failed to fetch transactions.',
        error
      );
    }
  }

  async addSettlement(
    houseId: string,
    from: string,
    to: string,
    amount: number,
    createdBy: string,
    note?: string
  ): Promise<SettlementData> {
    try {
      if (!houseId || !from || !to || !createdBy) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID, from, to, and createdBy are required.'
        );
      }

      if (from === to) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'Settlement must be between two different members.'
        );
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'Amount must be greater than 0.'
        );
      }

      await this.verifyUserInHouse(createdBy, houseId);
      await this.verifyUserInHouse(from, houseId);
      await this.verifyUserInHouse(to, houseId);

      if (createdBy !== from) {
        throw this.createError(
          FinanceServiceErrorCode.UNAUTHORIZED,
          'Only the person paying can record a settlement.'
        );
      }

      const settlement = await runTransaction(db, async (transaction) => {
        const settlementsRef = collection(db, 'houses', houseId, 'settlements');
        const newSettlementRef = doc(settlementsRef);

        const payload = {
          houseId,
          from,
          to,
          amount: Math.round(amount * 100) / 100,
          createdBy,
          note: note?.trim() || '',
          createdAt: serverTimestamp(),
        };

        transaction.set(newSettlementRef, payload);

        return {
          settlementId: newSettlementRef.id,
          ...payload,
        } as SettlementData;
      });

      try {
        await this.applySettlementAllocation(houseId, from, to, settlement.amount);
      } catch (allocationError) {
        console.error('Failed to allocate settlement to transactions:', allocationError);
      }

      return settlement;
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.TRANSACTION_FAILED,
        'Failed to add settlement. Please try again.',
        error
      );
    }
  }

  subscribeToSettlements(
    houseId: string,
    callback: (settlements: SettlementData[]) => void
  ): () => void {
    if (!houseId) {
      throw this.createError(
        FinanceServiceErrorCode.INVALID_INPUT,
        'House ID is required.'
      );
    }

    const settlementsRef = collection(db, 'houses', houseId, 'settlements');
    const q = query(settlementsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const settlements = snapshot.docs.map((docSnap) => ({
          settlementId: docSnap.id,
          ...docSnap.data(),
        })) as SettlementData[];
        callback(settlements);
      },
      (error) => {
        console.error('Error in settlements subscription:', error);
        callback([]);
      }
    );

    return unsubscribe;
  }

  async getHouseSettlements(houseId: string): Promise<SettlementData[]> {
    try {
      if (!houseId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID is required.'
        );
      }

      const settlementsRef = collection(db, 'houses', houseId, 'settlements');
      const q = query(settlementsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        settlementId: docSnap.id,
        ...docSnap.data(),
      })) as SettlementData[];
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.UNKNOWN_ERROR,
        'Failed to fetch settlements.',
        error
      );
    }
  }

  /**
   * Subscribe to real-time updates for transactions
   */
  subscribeToTransactions(
    houseId: string,
    callback: (transactions: TransactionData[]) => void
  ): () => void {
    if (!houseId) {
      throw this.createError(
        FinanceServiceErrorCode.INVALID_INPUT,
        'House ID is required.'
      );
    }

    const transactionsRef = collection(db, 'houses', houseId, 'transactions');
    const q = query(transactionsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const transactions = snapshot.docs.map((docSnap) => ({
          transactionId: docSnap.id,
          ...docSnap.data(),
        })) as TransactionData[];
        callback(transactions);
      },
      (error) => {
        console.error('Error in transactions subscription:', error);
        callback([]);
      }
    );

    return unsubscribe;
  }

  /**
   * Delete a transaction
   */
  async deleteTransaction(
    houseId: string,
    transactionId: string,
    userId: string
  ): Promise<void> {
    try {
      if (!houseId || !transactionId || !userId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID, transaction ID, and user ID are required.'
        );
      }

      await this.verifyUserInHouse(userId, houseId);

      const transactionRef = doc(db, 'houses', houseId, 'transactions', transactionId);
      const transactionDoc = await getDoc(transactionRef);

      if (!transactionDoc.exists()) {
        throw this.createError(
          FinanceServiceErrorCode.TRANSACTION_NOT_FOUND,
          'Transaction not found.'
        );
      }

      await deleteDoc(transactionRef);
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.TRANSACTION_FAILED,
        'Failed to delete transaction. Please try again.',
        error
      );
    }
  }

  /**
   * Confirm a transaction for a user
   */
  async confirmTransaction(
    houseId: string,
    transactionId: string,
    userId: string
  ): Promise<TransactionData> {
    try {
      if (!houseId || !transactionId || !userId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID, transaction ID, and user ID are required.'
        );
      }

      await this.verifyUserInHouse(userId, houseId);

      const transactionData = await runTransaction(db, async (transaction) => {
        const transactionRef = doc(db, 'houses', houseId, 'transactions', transactionId);
        const transactionDoc = await transaction.get(transactionRef);

        if (!transactionDoc.exists()) {
          throw this.createError(
            FinanceServiceErrorCode.TRANSACTION_NOT_FOUND,
            'Transaction not found.'
          );
        }

        const data = transactionDoc.data() as TransactionData;
        const splitWith = data.splitWith || [];

        if (!splitWith.includes(userId)) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'You are not part of this transaction.'
          );
        }

        const confirmedBy = data.confirmedBy || [];
        if (confirmedBy.includes(userId)) {
          return {
            transactionId,
            ...data,
          } as TransactionData;
        }

        const updatedConfirmedBy = Array.from(
          new Set([...confirmedBy, userId])
        );

        transaction.update(transactionRef, {
          confirmedBy: updatedConfirmedBy,
          updatedAt: serverTimestamp(),
        });

        return {
          transactionId,
          ...data,
          confirmedBy: updatedConfirmedBy,
        } as TransactionData;
      });

      return transactionData;
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.TRANSACTION_FAILED,
        'Failed to confirm transaction. Please try again.',
        error
      );
    }
  }

  async contestTransaction(
    houseId: string,
    transactionId: string,
    userId: string,
    reason: string,
    note?: string
  ): Promise<TransactionData> {
    try {
      if (!houseId || !transactionId || !userId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID, transaction ID, and user ID are required.'
        );
      }

      if (!reason?.trim()) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'A reason is required to contest this transaction.'
        );
      }

      await this.verifyUserInHouse(userId, houseId);

      const updated = await runTransaction(db, async (transaction) => {
        const transactionRef = doc(db, 'houses', houseId, 'transactions', transactionId);
        const transactionDoc = await transaction.get(transactionRef);

        if (!transactionDoc.exists()) {
          throw this.createError(
            FinanceServiceErrorCode.TRANSACTION_NOT_FOUND,
            'Transaction not found.'
          );
        }

        const data = transactionDoc.data() as TransactionData;
        const splitWith = data.splitWith || [];

        if (!splitWith.includes(userId)) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'You are not part of this transaction.'
          );
        }

        if ((data.confirmedBy || []).includes(userId)) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'You already confirmed this transaction.'
          );
        }

        const totalParticipants = splitWith.length;
        const confirmedCount = data.confirmedBy?.length ?? 0;
        if (totalParticipants > 0 && confirmedCount >= totalParticipants) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'This transaction has already been confirmed.'
          );
        }

        if (data.payerId === userId) {
          throw this.createError(
            FinanceServiceErrorCode.UNAUTHORIZED,
            'The payer cannot contest their own transaction.'
          );
        }

        const contestedBy = Array.from(new Set([...(data.contestedBy || []), userId]));
        const notePayload = {
          reason: reason.trim(),
          note: note?.trim() || '',
          createdAt: serverTimestamp(),
        };

        transaction.update(transactionRef, {
          contestedBy,
          [`contestNotes.${userId}`]: notePayload,
          updatedAt: serverTimestamp(),
        });

        return {
          ...data,
          transactionId,
          contestedBy,
        } as TransactionData;
      });

      try {
        await notificationService.sendAlfredNudge(
          houseId,
          userId,
          'BILL_CONTESTED',
          {
            transactionId,
            payerId: updated.payerId,
            reason: reason.trim(),
          }
        );
      } catch (notifyError) {
        console.error('Failed to send contest notification:', notifyError);
      }

      return updated;
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.TRANSACTION_FAILED,
        'Failed to contest transaction. Please try again.',
        error
      );
    }
  }

  /**
   * Calculate simplified debts for a house
   */
  async calculateDebts(houseId: string): Promise<SimplifiedDebt[]> {
    try {
      if (!houseId) {
        throw this.createError(
          FinanceServiceErrorCode.INVALID_INPUT,
          'House ID is required.'
        );
      }

      const [transactions, settlements, membersSnapshot] = await Promise.all([
        this.getHouseTransactions(houseId),
        this.getHouseSettlements(houseId),
        getDocs(query(collection(db, 'users'), where('houseId', '==', houseId))),
      ]);

      const memberNames = new Map<string, string>();
      membersSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as { name?: string };
        memberNames.set(docSnap.id, data?.name || 'Unknown');
      });

      const settlementTransactions = settlements
        .filter((settlement) => Number.isFinite(settlement.amount) && settlement.amount > 0)
        .map((settlement) => ({
          payerId: settlement.from,
          amount: settlement.amount,
          splitWith: [settlement.to],
        }));

      return calculateSimplifiedDebts(
        [
          ...transactions.map((transaction) => ({
            payerId: transaction.payerId,
            amount: transaction.amount,
            splitWith: transaction.splitWith || [],
            splitAmounts: transaction.splitAmounts,
          })),
          ...settlementTransactions,
        ],
        (userId) => memberNames.get(userId) || 'Unknown'
      );
    } catch (error) {
      if (this.isFinanceServiceError(error)) {
        throw error;
      }
      throw this.createError(
        FinanceServiceErrorCode.UNKNOWN_ERROR,
        'Failed to calculate debts.',
        error
      );
    }
  }

  /**
   * Verify a user is a member of a house
   */
  private async verifyUserInHouse(userId: string, houseId: string): Promise<void> {
    const houseDoc = await getDoc(doc(db, 'houses', houseId));

    if (!houseDoc.exists()) {
      throw this.createError(
        FinanceServiceErrorCode.HOUSE_NOT_FOUND,
        'House not found.'
      );
    }

    const members = (houseDoc.data().members || []) as string[];

    if (!members.includes(userId)) {
      throw this.createError(
        FinanceServiceErrorCode.USER_NOT_IN_HOUSE,
        'You are not a member of this house.'
      );
    }
  }

  private normalizeSplitAmounts(
    splitAmounts: Record<string, number> | null | undefined,
    splitWith: string[],
    amount: number
  ): Record<string, number> | null | undefined {
    if (splitAmounts === null) {
      return null;
    }
    if (!splitAmounts) {
      return undefined;
    }

    const normalized: Record<string, number> = {};
    splitWith.forEach((memberId) => {
      const value = Number(splitAmounts[memberId]);
      normalized[memberId] = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
    });

    const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - amount) > 0.02) {
      throw this.createError(
        FinanceServiceErrorCode.INVALID_INPUT,
        'Split amounts must add up to the total amount.'
      );
    }

    return normalized;
  }

  /**
   * Create a FinanceServiceError
   */
  private createError(
    code: FinanceServiceErrorCode,
    message: string,
    originalError?: any
  ): FinanceServiceError {
    return { code, message, originalError };
  }

  /**
   * Type guard to check if error is FinanceServiceError
   */
  private isFinanceServiceError(error: any): error is FinanceServiceError {
    return error && typeof error.code === 'string' && typeof error.message === 'string';
  }
}

export default new FinanceService();
