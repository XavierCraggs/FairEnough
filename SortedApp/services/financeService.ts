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
} from 'firebase/firestore';
import { db } from '../api/firebase';

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
  confirmedBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
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

const CURRENCY_EPSILON = 0.005;

/**
 * Finance service for managing house transactions and debts
 */
class FinanceService {
  /**
   * Add a new transaction to a house
   */
  async addTransaction(
    houseId: string,
    payerId: string,
    amount: number,
    description: string,
    splitWith: string[]
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
        const newTransaction = {
          houseId,
          payerId,
          payerName,
          amount: Math.round(amount * 100) / 100,
          description: description.trim(),
          splitWith: normalizedSplit,
          confirmedBy: [payerId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        transaction.set(newTransactionRef, newTransaction);

        return {
          transactionId: newTransactionRef.id,
          ...newTransaction,
        } as TransactionData;
      });

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

      const [transactions, membersSnapshot] = await Promise.all([
        this.getHouseTransactions(houseId),
        getDocs(query(collection(db, 'users'), where('houseId', '==', houseId))),
      ]);

      const memberNames = new Map<string, string>();
      membersSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as { name?: string };
        memberNames.set(docSnap.id, data?.name || 'Unknown');
      });

      const balances = new Map<string, number>();

      transactions.forEach((transaction) => {
        const splitWith = transaction.splitWith || [];
        if (!splitWith.length) {
          return;
        }

        const amount = Number(transaction.amount) || 0;
        if (amount === 0) {
          return;
        }

        const share = amount / splitWith.length;

        splitWith.forEach((memberId) => {
          const current = balances.get(memberId) ?? 0;
          balances.set(memberId, this.roundCurrency(current - share));
        });

        const payerBalance = balances.get(transaction.payerId) ?? 0;
        balances.set(
          transaction.payerId,
          this.roundCurrency(payerBalance + amount)
        );
      });

      const creditors: Array<{ userId: string; amount: number }> = [];
      const debtors: Array<{ userId: string; amount: number }> = [];

      balances.forEach((balance, userId) => {
        const rounded = this.roundCurrency(balance);
        if (rounded > CURRENCY_EPSILON) {
          creditors.push({ userId, amount: rounded });
        } else if (rounded < -CURRENCY_EPSILON) {
          debtors.push({ userId, amount: Math.abs(rounded) });
        }
      });

      const debts: SimplifiedDebt[] = [];
      let debtorIndex = 0;
      let creditorIndex = 0;

      while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex];
        const creditor = creditors[creditorIndex];
        const settleAmount = Math.min(debtor.amount, creditor.amount);

        if (settleAmount > CURRENCY_EPSILON) {
          debts.push({
            from: debtor.userId,
            fromName: memberNames.get(debtor.userId) || 'Unknown',
            to: creditor.userId,
            toName: memberNames.get(creditor.userId) || 'Unknown',
            amount: this.roundCurrency(settleAmount),
          });
        }

        debtor.amount = this.roundCurrency(debtor.amount - settleAmount);
        creditor.amount = this.roundCurrency(creditor.amount - settleAmount);

        if (debtor.amount <= CURRENCY_EPSILON) {
          debtorIndex += 1;
        }
        if (creditor.amount <= CURRENCY_EPSILON) {
          creditorIndex += 1;
        }
      }

      return debts;
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

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
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
