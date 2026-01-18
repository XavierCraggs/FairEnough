export interface SimplifiedDebt {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface MinimalTransaction {
  payerId: string;
  amount: number;
  splitWith: string[];
}

const CURRENCY_EPSILON = 0.005;

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

export const calculateSimplifiedDebts = (
  transactions: MinimalTransaction[],
  resolveName: (userId: string) => string
): SimplifiedDebt[] => {
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
      balances.set(memberId, roundCurrency(current - share));
    });

    const payerBalance = balances.get(transaction.payerId) ?? 0;
    balances.set(transaction.payerId, roundCurrency(payerBalance + amount));
  });

  const creditors: Array<{ userId: string; amount: number }> = [];
  const debtors: Array<{ userId: string; amount: number }> = [];

  balances.forEach((balance, userId) => {
    const rounded = roundCurrency(balance);
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
        fromName: resolveName(debtor.userId),
        to: creditor.userId,
        toName: resolveName(creditor.userId),
        amount: roundCurrency(settleAmount),
      });
    }

    debtor.amount = roundCurrency(debtor.amount - settleAmount);
    creditor.amount = roundCurrency(creditor.amount - settleAmount);

    if (debtor.amount <= CURRENCY_EPSILON) {
      debtorIndex += 1;
    }
    if (creditor.amount <= CURRENCY_EPSILON) {
      creditorIndex += 1;
    }
  }

  return debts;
};
