-- Billing hardening: discount type, stored paid/balance amounts, payment records
-- and a financial audit log. Existing invoices are backfilled without changing
-- any stored totals.

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "balanceDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "confirmationSentAt" TIMESTAMP(3),
    "confirmationChannel" TEXT,
    "confirmationCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");
CREATE INDEX "Payment_isVoided_idx" ON "Payment"("isVoided");
CREATE INDEX "AuditLog_invoiceId_idx" ON "AuditLog"("invoiceId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------- backfill
-- Existing discounts were always entered as a fixed amount.
UPDATE "Invoice" SET "discountType" = 'FIXED', "discountValue" = "discount" WHERE "discount" > 0;

-- An invoice marked PAID becomes one payment for its full stored total, dated
-- when it was marked paid. Deterministic ids keep this idempotent.
INSERT INTO "Payment" ("id", "invoiceId", "customerId", "amount", "method", "paidAt", "notes", "createdById", "createdAt", "updatedAt")
SELECT
    'mig_' || md5(i."id"),
    i."id",
    i."customerId",
    i."totalAmount",
    COALESCE(NULLIF(btrim(i."paymentMethod"), ''), 'Not recorded'),
    COALESCE(i."paidAt", i."updatedAt"),
    'Recorded from the invoice''s PAID status when payment tracking was introduced',
    i."createdById",
    COALESCE(i."paidAt", i."updatedAt"),
    CURRENT_TIMESTAMP
FROM "Invoice" i
WHERE i."paymentStatus" = 'PAID' AND i."totalAmount" > 0
ON CONFLICT ("id") DO NOTHING;

UPDATE "Invoice"
SET "amountPaid" = CASE WHEN "paymentStatus" = 'PAID' THEN "totalAmount" ELSE 0 END,
    "balanceDue" = CASE WHEN "paymentStatus" = 'PAID' THEN 0 ELSE "totalAmount" END;

-- A zero-value invoice has nothing to collect, so it is settled.
UPDATE "Invoice"
SET "paymentStatus" = 'PAID', "paidAt" = COALESCE("paidAt", "createdAt")
WHERE "totalAmount" = 0 AND "paymentStatus" <> 'PAID';

INSERT INTO "AuditLog" ("id", "entityType", "entityId", "invoiceId", "action", "newValue", "createdAt")
SELECT 'mig_' || md5('audit' || p."id"), 'PAYMENT', p."id", p."invoiceId", 'PAYMENT_MIGRATED',
       jsonb_build_object('amount', p."amount", 'method', p."method", 'paidAt', p."paidAt"),
       CURRENT_TIMESTAMP
FROM "Payment" p
WHERE p."id" LIKE 'mig\_%'
ON CONFLICT ("id") DO NOTHING;
