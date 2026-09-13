/**
 * Bootstrap script - creates the garage owner account and the garage profile row.
 *
 *   npm run db:seed
 *
 * Safe to re-run: both records are upserted and existing values are never
 * overwritten, so it can be pointed at a live database without touching data.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { BRAND_NAME, BRAND_SUBTITLE } from '../src/lib/brand';

const prisma = new PrismaClient();

// Single-login app: one owner (ADMIN) account, configured via env.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Owner';

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding (see .env.example).',
    );
  }

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: 'ADMIN',
    },
  });

  await prisma.garage.upsert({
    where: { id: 'garage' },
    update: {},
    create: { id: 'garage', name: BRAND_NAME, tagline: BRAND_SUBTITLE },
  });

  console.log(`Owner account ready: ${ADMIN_EMAIL}`);
  console.log('Finish the garage details in Settings - Garage after signing in.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
