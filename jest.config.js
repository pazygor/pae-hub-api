/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // tsconfig.spec.json usa isolatedModules (transpila por arquivo, sem type-check
    // cruzado) — espelha o `--transpile-only` com que a app roda em dev.
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // `uuid` v14 é ESM puro e quebra no runtime CommonJS do Jest — usa mock local.
    '^uuid$': '<rootDir>/test/mocks/uuid.ts',
  },
};
