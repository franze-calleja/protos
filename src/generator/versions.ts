/**
 * Single source of truth for dependency versions in GENERATED projects.
 * Bumping a generated project's dependency is a one-file change.
 * Resolve current values with: npm view <pkg> version
 *
 * These are deliberate pins, not blindly-latest. Two carry a rationale:
 *
 * - typescript: three majors are live (5.9, 6.0, 7.0). Both 6 and 7 are still
 *   at x.0, and the dependency policy is to avoid day-one majors. create-next-app
 *   itself still installs ^5, so generated projects match the ecosystem.
 * - @types/node: tracks Node *LTS* (24), not Current (26), matching the runtime
 *   generated projects are expected to run on.
 */
export const VERSIONS: Record<string, string> = {
  // framework
  next: '^16.3.2',
  react: '^19.2.8',
  'react-dom': '^19.2.8',

  // language + types
  typescript: '^5.9.3',
  '@types/node': '^24.13.3',
  '@types/react': '^19.2.18',
  '@types/react-dom': '^19.2.4',

  // backend
  express: '^5.2.1',
  '@types/express': '^5.0.6',
  tsx: '^4.23.12',
  turbo: '^2.10.11',
  pino: '^10.3.1',
  'pino-http': '^11.0.0',
  'pino-pretty': '^13.1.3',
  helmet: '^8.3.0',
  'express-rate-limit': '^8.6.2',

  // linting — eslint-config-next tracks the Next major
  eslint: '^10.9.0',
  prettier: '^3.9.6',
  'typescript-eslint': '^8.67.0',
  '@eslint/js': '^10.0.1',
  'eslint-config-next': '^16.3.2',

  // frontend
  vite: '^8.2.2',
  '@vitejs/plugin-react': '^6.1.0',
  expo: '^57.0.15',
  'expo-router': '^57.0.15',
  'react-native': '^0.87.0',
  'react-native-web': '^0.21.2',
  '@tanstack/react-query': '^5.102.2',
  '@tanstack/react-table': '^8.21.3',
  zustand: '^5.0.15',
  'react-hook-form': '^7.86.0',
  '@hookform/resolvers': '^5.9.1',
  jest: '^30.4.2',
  'jest-expo': '^57.0.4',
  '@types/jest': '^30.0.0',

  // styling
  tailwindcss: '^4.3.3',
  '@tailwindcss/postcss': '^4.3.3',

  // data — Prisma 7 requires a driver adapter alongside the client
  '@prisma/client': '^7.9.1',
  prisma: '^7.9.1',
  '@prisma/adapter-pg': '^7.9.1',
  '@prisma/adapter-mariadb': '^7.9.1',
  dotenv: '^17.4.2',

  // validation + testing
  zod: '^4.4.3',
  vitest: '^4.1.11',
  supertest: '^7.2.2',
  '@types/supertest': '^7.2.1',
}

export function dep(name: string): string {
  const version = VERSIONS[name]
  if (!version) throw new Error(`No pinned version for "${name}" — add it to versions.ts`)
  return version
}
