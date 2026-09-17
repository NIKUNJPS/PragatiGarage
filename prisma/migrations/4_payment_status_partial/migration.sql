-- Kept in its own migration: Postgres cannot use a newly added enum value in the
-- same transaction that adds it.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
