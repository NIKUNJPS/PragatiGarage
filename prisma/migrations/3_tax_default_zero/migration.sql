-- Default new garages to 0% tax so the invoice total equals the sum of items
-- unless GST is explicitly added.
ALTER TABLE "Garage" ALTER COLUMN "defaultTaxRate" SET DEFAULT 0;
