import { calculateSimplifiedDebts } from '../utils/finance';

describe('calculateSimplifiedDebts', () => {
  it('simplifies debts for the example scenario', () => {
    const transactions = [
      { payerId: 'alice', amount: 30, splitWith: ['alice', 'bob', 'charlie'] },
      { payerId: 'bob', amount: 20, splitWith: ['alice', 'bob', 'charlie'] },
      { payerId: 'charlie', amount: 10, splitWith: ['alice', 'bob', 'charlie'] },
    ];

    const debts = calculateSimplifiedDebts(transactions, (id) => id);
    const summary = debts.map((debt) => ({
      from: debt.from,
      to: debt.to,
      amount: debt.amount,
    }));

    expect(summary).toEqual([{ from: 'charlie', to: 'alice', amount: 10 }]);
  });
});
