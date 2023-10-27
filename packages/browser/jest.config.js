const { createJestTSConfig } = require('@internal/config')

module.exports = createJestTSConfig(__dirname, {
  modulePathIgnorePatterns: ['<rootDir>/e2e-tests', '<rootDir>/qa'],
  setupFilesAfterEnv: ['./jest.setup.js'],
  testEnvironment: 'jsdom',
  coverageThreshold: {
    global: {
      branches: 80.91,
      functions: 87.25,
      lines: 91.03,
      statements: 87.25,
    },
  },
  transformIgnorePatterns: [
    // Hispter devs in crypto-es using ESM modules :facepalm:
    // https://github.com/jestjs/jest/issues/6229#issuecomment-403539460
    '/node_modules/(?!crypto-es).+\\.js$',
  ],
})
