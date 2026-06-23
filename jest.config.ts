import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Só roda arquivos em __tests__ ou *.test.ts — nunca arquivos Next.js
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Não transforma node_modules
  transformIgnorePatterns: ['/node_modules/'],
  // Resolve paths do tsconfig
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

export default config
