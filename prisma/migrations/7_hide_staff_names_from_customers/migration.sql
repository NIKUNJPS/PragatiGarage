-- Car attendant and "bill created by" are internal and no longer printed on the
-- customer's PDF. A PDF stored in object storage before this change may still
-- show them, so drop those cached links: the next share or download renders a
-- fresh PDF and overwrites the stored file (same path), so old links get it too.
UPDATE "Invoice"
SET "pdfUrl" = NULL
WHERE "pdfUrl" IS NOT NULL
  AND ("attendantName" IS NOT NULL OR "billedByName" IS NOT NULL);
