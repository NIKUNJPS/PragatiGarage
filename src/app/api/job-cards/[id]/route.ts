import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, ok, parseBody, withAuth } from '@/lib/api';
import { serializeJobCardDetail } from '@/lib/serializers';
import { round2 } from '@/lib/utils';
import { jobCardSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const include = {
  customer: {
    include: {
      _count: { select: { vehicles: true, jobCards: true } },
      invoices: { select: { totalAmount: true, paymentStatus: true } },
    },
  },
  vehicle: {
    include: {
      customer: { select: { id: true, name: true, mobileNumber: true } },
      _count: { select: { jobCards: true } },
    },
  },
  parts: { orderBy: { sortOrder: 'asc' } },
  labourCharges: { orderBy: { sortOrder: 'asc' } },
  serviceCharges: { orderBy: { sortOrder: 'asc' } },
  invoice: { select: { id: true, invoiceNumber: true, paymentStatus: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.JobCardInclude;

type Loaded = Prisma.JobCardGetPayload<{ include: typeof include }>;

function toDetail(jobCard: Loaded) {
  return serializeJobCardDetail({
    ...jobCard,
    customer: {
      id: jobCard.customer.id,
      name: jobCard.customer.name,
      mobileNumber: jobCard.customer.mobileNumber,
    },
    vehicle: {
      id: jobCard.vehicle.id,
      vehicleNumber: jobCard.vehicle.vehicleNumber,
      vehicleType: jobCard.vehicle.vehicleType,
      brand: jobCard.vehicle.brand,
      model: jobCard.vehicle.model,
    },
    customerFull: jobCard.customer,
    vehicleFull: jobCard.vehicle,
  });
}

export const GET = withAuth(async (_req, { params }) => {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: params.id }, include });
  if (!jobCard) throw new ApiError(404, 'That job card no longer exists.');
  return ok(toDetail(jobCard));
});

export const PATCH = withAuth(async (req, { params }) => {
  const input = await parseBody(req, jobCardSchema);

  const existing = await prisma.jobCard.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, invoice: { select: { id: true } } },
  });
  if (!existing) throw new ApiError(404, 'That job card no longer exists.');

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true, customerId: true },
  });
  if (!vehicle) throw new ApiError(400, 'Choose a valid vehicle for this job card.');

  const jobCard = await prisma.$transaction(async (tx) => {
    // Line items are replaced wholesale - simpler and safer than diffing, and
    // the invoice keeps its own frozen copy so history is never rewritten.
    await tx.partUsed.deleteMany({ where: { jobCardId: params.id } });
    await tx.labourCharge.deleteMany({ where: { jobCardId: params.id } });
    await tx.serviceCharge.deleteMany({ where: { jobCardId: params.id } });

    return tx.jobCard.update({
      where: { id: params.id },
      data: {
        vehicleId: vehicle.id,
        customerId: vehicle.customerId,
        complaint: input.complaint ?? '',
        workPerformed: input.workPerformed ?? '',
        status: input.status,
        odometer: input.odometer ?? null,
        completedAt:
          input.status === 'COMPLETED'
            ? existing.status === 'COMPLETED'
              ? undefined
              : new Date()
            : null,
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
  });

  if (input.odometer) {
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { odometer: input.odometer } });
  }

  return ok(toDetail(jobCard));
});

/** Archive a job card. Admin only, and never when it has already been invoiced. */
export const DELETE = withAuth(async (req, { params }) => {
  const url = new URL(req.url);
  const restore = url.searchParams.get('restore') === 'true';

  const jobCard = await prisma.jobCard.findUnique({
    where: { id: params.id },
    select: { id: true, invoice: { select: { invoiceNumber: true } } },
  });
  if (!jobCard) throw new ApiError(404, 'That job card no longer exists.');

  if (!restore && jobCard.invoice) {
    throw new ApiError(
      409,
      `This job card is billed on invoice ${jobCard.invoice.invoiceNumber} and cannot be archived.`,
    );
  }

  const updated = await prisma.jobCard.update({
    where: { id: params.id },
    data: { isArchived: !restore },
    include,
  });

  return ok({
    ...toDetail(updated),
    message: restore ? 'Job card restored.' : 'Job card archived.',
  });
}, adminOnly);
