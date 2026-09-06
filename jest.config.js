module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    'react-native-config': '<rootDir>/__mocks__/react-native-config.js',
    'react-native-inappbrowser-reborn':
      '<rootDir>/__mocks__/react-native-inappbrowser-reborn.js',
    '\\.(png|jpg|jpeg|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },
  // Keep RN preset transform exceptions; inappbrowser is mocked above for Node.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-inappbrowser-reborn)/)',
  ],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
