module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  testPathIgnorePatterns: ['/tests/integration/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // @stellar/stellar-sdk (used by the CLI) depends on ESM-only packages; compile those to CommonJS.
    '^.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true }, diagnostics: false }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(uint8array-extras|@noble|smol-toml|eventsource|eventsource-parser|bignumber\\.js|feaxios)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
}; 