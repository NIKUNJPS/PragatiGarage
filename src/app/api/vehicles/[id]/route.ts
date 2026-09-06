import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, ok, parseBody, withAuth } from '@/lib/api';
import { serializeJobCardListItem, serializeVehicle } from '@/lib/serializers';
import { round2, toNumber } from '@/lib/utils';
import { vehicleSchema } from '@/lib/validations';
import type { VehicleDetailDTO } from '@/types';

export const dynamic = 'force-dynamic';

const include = {
  customer: { select: { id: true, name: true, mobileNumber: true } },
  _count: { select: { jobCards: true } },
  jobCards: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.VehicleInclude;

export const GET = withAuth(async (_req, { params }) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: params.id }, include });
  if (!vehicle) throw new ApiError(404, 'That vehicle no longer exists.');

  // Full service history - the reason a mechanic opens this page at all.
  const jobCards = await prisma.jobCard.findMany({
    where: { vehicleId: vehicle.id, isArchived: false },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, mobileNumber: true } },
      vehicle: {
        select: { id: true, vehicleNumber: true, vehicleType: true, brand: true, model: true },
      },
      parts: true,
      labourCharges: true,
      serviceCharges: true,
      invoice: { select: { id: true, invoiceNumber: true, paymentStatus: true } },
      createdBy: { select: { name: true } },
    },
  });

  const invoiceAgg = await prisma.invoice.aggregate({
    where: { jobCard: { vehicleId: vehicle.id }, isArchived: false },
    _sum: { totalAmount: true },
  });

  const body: VehicleDetailDTO = {
    ...serializeVehicle(vehicle),
    jobCards: jobCards.map(serializeJobCardListItem),
    totalBilled: round2(toNumber(invoiceAgg._sum.totalAmount)),
  };

  return ok(body);
});

export const PATCH = withAuth(async (req, { params }) => {
  const input = await parseBody(req, vehicleSchema);

  const existing = await prisma.vehicle.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, 'That vehicle no longer exists.');

  if (input.vehicleNumber !== existing.vehicleNumber) {
    const clash = await prisma.vehicle.findUnique({ where: { vehicleNumber: input.vehicleNumber } });
    if (clash) {
      throw new ApiError(409, `Vehicle ${input.vehicleNumber} is already registered.`, {
        vehicleNumber: ['This vehicle number is already registered.'],
      });
    }
  }

  const vehicle = await prisma.vehicle.update({
    where: { id: params.id },
    data: {
      vehicleNumber: input.vehicleNumber,
      vehicleType: input.vehicleType,
      brand: input.brand ?? '',
      model: input.model ?? '',
      year: input.year ?? null,
      color: input.color ?? null,
      odometer: input.odometer ?? null,
      customerId: input.customerId,
    },
    include,
  });

  return ok(serializeVehicle(vehicle));
});

/**
 * Hard-delete only when the vehicle has never been worked on; otherwise archive
 * it so its job cards and invoices keep pointing at a real record.
 */
export const DELETE = withAuth(async (req, { params }) => {
  const url = new URL(req.url);
  const restore = url.searchParams.get('restore') === 'true';

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: params.id },
    include: { _count: { select: { jobCards: true } } },
  });
  if (!vehicle) throw new ApiError(404, 'That vehicle no longer exists.');

  if (restore) {
    const restored = await prisma.vehicle.update({
      where: { id: params.id },
      data: { isArchived: false },
      include,
    });
    return ok({ ...serializeVehicle(restored), deleted: false, message: 'Vehicle restored.' });
  }

  if (vehicle._count.jobCards === 0) {
    await prisma.vehicle.delete({ where: { id: params.id } });
    return ok({ deleted: true, message: 'Vehicle deleted.' });
  }

  const archived = await prisma.vehicle.update({
    where: { id: params.id },
    data: { isArchived: true },
    include,
  });

  return ok({
    ...serializeVehicle(archived),
    deleted: false,
    message: `Vehicle archived - it has ${vehicle._count.jobCards} job card(s) in its history.`,
  });
}, adminOnly);
