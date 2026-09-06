import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, created, ok, paginated, parseBody, parseQuery, withAuth } from '@/lib/api';
import { nextDocumentNumber } from '@/lib/garage';
import { serializeJobCardListItem } from '@/lib/serializers';
import { endOfDay, normalizeVehicleNumber, round2 } from '@/lib/utils';
import { jobCardListQuerySchema, jobCardSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const include = {
  customer: { select: { id: true, name: true, mobileNumber: true } },
  vehicle: { select: { id: true, vehicleNumber: true, vehicleType: true, brand: true, model: true } },
  parts: { orderBy: { sortOrder: 'asc' } },
  labourCharges: { orderBy: { sortOrder: 'asc' } },
  serviceCharges: { orderBy: { sortOrder: 'asc' } },
  invoice: { select: { id: true, invoiceNumber: true, paymentStatus: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.JobCardInclude;

function parseDate(value: string | undefined, end = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return end ? endOfDay(d) : new Date(d.setHours(0, 0, 0, 0));
}

export const GET = withAuth(async (req) => {
  const { q, page, pageSize, sortDir, includeArchived, status, from, to, customerId, vehicleId } =
    parseQuery(req, jobCardListQuerySchema);

  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  const where: Prisma.JobCardWhereInput = {
    ...(includeArchived ? {} : { isArchived: false }),
    ...(customerId ? { customerId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(status === 'ACTIVE'
      ? { status: { in: ['PENDING', 'IN_PROGRESS'] } }
      : status && status !== 'ALL'
        ? { status }
        : {}),
    ...(fromDate || toDate
      ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { jobCardNumber: { contains: q, mode: 'insensitive' } },
            { vehicle: { vehicleNumber: { contains: normalizeVehicleNumber(q) } } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            { customer: { mobileNumber: { contains: q.replace(/\D/g, '') || q } } },
            { complaint: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.jobCard.findMany({
      where,
      include,
      orderBy: { createdAt: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.jobCard.count({ where }),
  ]);

  return ok(paginated(rows.map(serializeJobCardListItem), total, page, pageSize));
});

export const POST = withAuth(async (req, { user }) => {
  const input = await parseBody(req, jobCardSchema);

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true, customerId: true, isArchived: true },
  });
  if (!vehicle) throw new ApiError(400, 'Choose a valid vehicle for this job card.');
  if (vehicle.isArchived)
    throw new ApiError(400, 'That vehicle is archived. Restore it before creating a job card.');

  // The number is reserved atomically, so two mechanics saving at the same
  // moment can never end up with the same job card number.
  const jobCardNumber = await nextDocumentNumber('jobCard');

  const jobCard = await prisma.jobCard.create({
    data: {
      jobCardNumber,
      vehicleId: vehicle.id,
      customerId: vehicle.customerId,
      complaint: input.complaint ?? '',
      workPerformed: input.workPerformed ?? '',
      status: input.status,
      odometer: input.odometer,
      completedAt: input.status === 'COMPLETED' ? new Date() : null,
      createdById: user.id,
      parts: {
        create: input.parts.map((p, i) => ({
          partName: p.partName,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          total: round2(p.quantity * p.unitPrice),
          sortOrder: i,
        })),
      },
      labourCharges: {
        create: input.labourCharges.map((l, i) => ({
          description: l.description,
          amount: l.amount,
          sortOrder: i,
        })),
      },
      serviceCharges: {
        create: input.serviceCharges.map((s, i) => ({
          description: s.description,
          amount: s.amount,
          sortOrder: i,
        })),
      },
    },
    include,
  });

  // Keep the vehicle's last-known odometer reading in step with the job card.
  if (input.odometer) {
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { odometer: input.odometer },
    });
  }

  return created(serializeJobCardListItem(jobCard));
});
