-- Add editable garage tagline (shown on invoices under the name)
ALTER TABLE "Garage" ADD COLUMN "tagline" TEXT NOT NULL DEFAULT '';
