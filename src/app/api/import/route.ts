import { prisma } from '@/lib/prisma';
import { ok, parseBody, withAuth } from '@/lib/api';
import { nextDocumentNumber } from '@/lib/garage';
import { publicToken } from '@/lib/auth';
import { round2 } from '@/lib/utils';
import { importPayloadSchema, importRowSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

interface RowResult {
  row: number;
  status: 'created' | 'skipped' | 'error';
  message: string;
  customer?: string;
  vehicle?: string;
}

/** Last 10 digits, used to match a customer already in the book. */
function mobileKey(mobile: string): string {
  return mobile.replace(/\D/g, '').slice(-10);
}

/**
 * Bulk import of past/historical data.
 *
 * Each row carries a customer + a vehicle and, optionally, one past service.
 * Rows are processed one-by-one so a single bad row never aborts the whole
 * import - every row comes back with its own created / skipped / error status.
 *
 * - Customers are matched by mobile number (last 10 digits) and reused, so the
 *   same customer across many rows is created only once.
 * - A vehicle number that already exists is skipped (reported), never duplicated.
 * - When a past service date or amount is present, a COMPLETED job card and a
 *   PAID invoice are back-dated to that date, so old history and revenue show up.
 */
export const POST = withAuth(async (req, { user }) => {
  const { rows, markServicesPaid } = await parseBody(req, importPayloadSchema);

  const results: RowResult[] = [];
  // Cache customers created/found in THIS batch, keyed by mobile.
  const customerCache = new Map<string, string>();

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let servicesAdded = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const parsed = importRowSchema.safeParse(rows[i]);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      const field = firstError?.path?.join('.') || 'row';
      results.push({
        row: rowNumber,
        status: 'error',
        message: `${field}: ${firstError?.message ?? 'Invalid data.'}`,
      });
      failed++;
      continue;
    }

    const data = parsed.data;

    try {
      // ---- customer (find by mobile, reuse across the batch) ----------------
      const key = mobileKey(data.mobileNumber);
      let customerId = customerCache.get(key);

      if (!customerId) {
        const existing = await prisma.customer.findFirst({
          where: { mobileNumber: { contains: key } },
          select: { id: true },
        });
        if (existing) {
          customerId = existing.id;
        } else {
          const customer = await prisma.customer.create({
            data: {
              name: data.customerName,
              mobileNumber: data.mobileNumber,
              whatsappNumber: data.whatsappNumber ?? data.mobileNumber,
              address: data.address,
              createdById: user.id,
            },
            select: { id: true },
          });
          customerId = customer.id;
        }
        customerCache.set(key, customerId);
      }

      // ---- vehicle (skip if the number already exists) ----------------------
      const existingVehicle = await prisma.vehicle.findUnique({
        where: { vehicleNumber: data.vehicleNumber },
        select: { id: true },
      });

      if (existingVehicle) {
        results.push({
          row: rowNumber,
          status: 'skipped',
          message: `Vehicle ${data.vehicleNumber} already exists - not imported again.`,
          customer: data.customerName,
          vehicle: data.vehicleNumber,
        });
        skipped++;
        continue;
      }

      const vehicle = await prisma.vehicle.create({
        data: {
          vehicleNumber: data.vehicleNumber,
          vehicleType: data.vehicleType,
          brand: data.brand,
          model: data.model,
          year: data.year,
          odometer: data.odometer,
          customerId,
          createdById: user.id,
        },
        select: { id: true },
      });

      // ---- optional back-dated service record -------------------------------
      let serviceNote = '';
      const hasService = Boolean(data.lastServiceDate || data.lastServiceNote || data.lastServiceAmount);

      if (hasService) {
        const when = data.lastServiceDate ? new Date(data.lastServiceDate) : new Date();
        const amount = round2(data.lastServiceAmount ?? 0);
        const description = data.lastServiceNote || 'Past service (imported)';

        const jobCardNumber = await nextDocumentNumber('jobCard');
        const jobCard = await prisma.jobCard.create({
          data: {
            jobCardNumber,
            vehicleId: vehicle.id,
            customerId,
            complaint: 'Imported historical record',
            workPerformed: description,
            status: 'COMPLETED',
            odometer: data.odometer,
            completedAt: when,
            createdAt: when,
            createdById: user.id,
            serviceCharges: amount > 0
              ? { create: [{ description, amount, sortOrder: 0 }] }
              : undefined,
          },
          select: { id: true },
        });

        // Only raise an invoice when there is an amount to bill.
        if (amount > 0) {
          const invoiceNumber = await nextDocumentNumber('invoice');
          await prisma.invoice.create({
            data: {
              invoiceNumber,
              publicToken: publicToken(),
              jobCardId: jobCard.id,
              customerId,
              subtotal: amount,
              taxRate: 0,
              tax: 0,
              discount: 0,
              totalAmount: amount,
              paymentStatus: markServicesPaid ? 'PAID' : 'UNPAID',
              paymentMethod: markServicesPaid ? 'Imported' : null,
              paidAt: markServicesPaid ? when : null,
              notes: 'Imported from past records',
              createdById: user.id,
              createdAt: when,
              items: {
                create: [
                  {
                    kind: 'SERVICE',
                    description,
                    quantity: 1,
                    unitPrice: amount,
                    total: amount,
                    sortOrder: 0,
                  },
                ],
              },
            },
          });
        }
        servicesAdded++;
        serviceNote = amount > 0 ? ' + past service & bill' : ' + past service';
      }

      results.push({
        row: rowNumber,
        status: 'created',
        message: `Added ${data.vehicleNumber}${serviceNote}.`,
        customer: data.customerName,
        vehicle: data.vehicleNumber,
      });
      created++;
    } catch (error) {
      console.error(`[import] row ${rowNumber} failed:`, error);
      results.push({
        row: rowNumber,
        status: 'error',
        message: 'Could not save this row. Check the vehicle number and try again.',
      });
      failed++;
    }
  }

  return ok({
    summary: { total: rows.length, created, skipped, failed, servicesAdded },
    results,
  });
});
