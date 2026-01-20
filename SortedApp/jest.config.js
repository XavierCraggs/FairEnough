module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  transformIgnorePatterns: [
    'node_modules/(?!(expo|expo-router|expo-modules-core|@expo|react-native|@react-native|@react-navigation)/)',
  ],
  moduleNameMapper: {
    '^firebase/firestore$': '<rootDir>/__mocks__/firebaseFirestoreMock.js',
    '^firebase/app$': '<rootDir>/__mocks__/firebaseAppMock.js',
    '^firebase/auth$': '<rootDir>/__mocks__/firebaseAuthMock.js',
    '^firebase/functions$': '<rootDir>/__mocks__/firebaseFunctionsMock.js',
    '^firebase/storage$': '<rootDir>/__mocks__/firebaseStorageMock.js',
    '^expo-constants$': '<rootDir>/__mocks__/expoConstantsMock.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/asyncStorageMock.js',
  },
};
