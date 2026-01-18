module.exports = {
  getFirestore: jest.fn(() => ({})),
  addDoc: jest.fn(),
  arrayUnion: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  serverTimestamp: jest.fn(),
  updateDoc: jest.fn(),
  Timestamp: {
    fromDate: jest.fn((date) => date),
  },
  where: jest.fn(),
  limit: jest.fn(),
};
