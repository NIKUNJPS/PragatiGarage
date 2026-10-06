-- Car attendant and "bill created by" names on invoices. Both are free text
-- typed on the bill form; existing invoices keep NULL ("not recorded").

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "attendantName" TEXT,
ADD COLUMN     "billedByName" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_attendantName_idx" ON "Invoice"("attendantName");
CREATE INDEX "Invoice_billedByName_idx" ON "Invoice"("billedByName");
