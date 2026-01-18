import { getAlfredMessage } from '../services/notificationService';

describe('getAlfredMessage', () => {
  it('returns a chore completion message with chore name', () => {
    const message = getAlfredMessage('CHORE_DUE', {
      choreName: 'Dishes',
      action: 'completed',
    });
    expect(message).toContain('Dishes');
  });

  it('returns a bill added message with amount', () => {
    const message = getAlfredMessage('BILL_ADDED', {
      amount: 12.5,
    });
    expect(message).toContain('$12.50');
  });
});
