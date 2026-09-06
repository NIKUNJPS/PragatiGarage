import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, created, ok, paginated, parseBody, parseQuery, withAuth } from '@/lib/api';
import { serializeVehicle } from '@/lib/serializers';
import { normalizeVehicleNumber } from '@/lib/utils';
import { vehicleListQuerySchema, vehicleSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const include = {
  customer: { select: { id: true, name: true, mobileNumber: true } },
  _count: { select: { jobCards: true } },
  jobCards: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.VehicleInclude;

const SORTABLE: Record<string, string> = {
  vehicleNumber: 'vehicleNumber',
  brand: 'brand',
  createdAt: 'createdAt',
};

export const GET = withAuth(async (req) => {
  const { q, page, pageSize, sortBy, sortDir, includeArchived, vehicleType, customerId } =
    parseQuery(req, vehicleListQuerySchema);

  const where: Prisma.VehicleWhereInput = {
    ...(includeArchived ? {} : { isArchived: false }),
    ...(vehicleType && vehicleType !== 'ALL' ? { vehicleType } : {}),
    ...(customerId ? { customerId } : {}),
    ...(q
      ? {
          OR: [
            // Vehicle numbers are stored normalised, so normalise the query too.
            { vehicleNumber: { contains: normalizeVehicleNumber(q) } },
            { brand: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const orderByField = SORTABLE[sortBy ?? ''] ?? 'createdAt';

  const [rows, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include,
      orderBy: { [orderByField]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return ok(paginated(rows.map(serializeVehicle), total, page, pageSize));
});

export const POST = withAuth(async (req, { user }) => {
  const input = await parseBody(req, vehicleSchema);

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Choose a valid customer for this vehicle.');

  const duplicate = await prisma.vehicle.findUnique({
    where: { vehicleNumber: input.vehicleNumber },
    include: { customer: { select: { name: true } } },
  });
  if (duplicate) {
    throw new ApiError(
      409,
      `Vehicle ${input.vehicleNumber} is already registered to ${duplicate.customer.name}.`,
      { vehicleNumber: ['This vehicle number is already registered.'] },
    );
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      vehicleNumber: input.vehicleNumber,
      vehicleType: input.vehicleType,
      brand: input.brand ?? '',
      model: input.model ?? '',
      year: input.year,
      color: input.color,
      odometer: input.odometer,
      customerId: input.customerId,
      createdById: user.id,
    },
    include,
  });

  return created(serializeVehicle(vehicle));
});
