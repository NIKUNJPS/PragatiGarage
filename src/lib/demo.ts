/**
 * Public demo credentials shown on the landing page and the login screen.
 * Keep this in sync with the SEED_ADMIN_* defaults in prisma/seed.ts and
 * .env.example - all three must agree for the "Try live demo" flow to work.
 */
export const DEMO_CREDENTIALS = {
  email: 'demo@wrenchbook.app',
  password: 'Demo@1234',
} as const;
