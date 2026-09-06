import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { created, ok, paginated, parseBody, parseQuery, withAuth } from '@/lib/api';
import { serializeCustomer } from '@/lib/serializers';
import { customerSchema, listQuerySchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const include = {
  _count: { select: { vehicles: true, jobCards: true } },
  invoices: { select: { totalAmount: true, paymentStatus: true } },
} satisfies Prisma.CustomerInclude;

const SORTABLE: Record<string, string> = {
  name: 'name',
  createdAt: 'createdAt',
  mobileNumber: 'mobileNumber',
};

export const GET = withAuth(async (req) => {
  const { q, page, pageSize, sortBy, sortDir, includeArchived } = parseQuery(req, listQuerySchema);

  const where: Prisma.CustomerWhereInput = {
    ...(includeArchived ? {} : { isArchived: false }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { mobileNumber: { contains: q.replace(/\D/g, '') || q } },
            { whatsappNumber: { contains: q.replace(/\D/g, '') || q } },
          ],
        }
      : {}),
  };

  const orderByField = SORTABLE[sortBy ?? ''] ?? 'createdAt';

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include,
      orderBy: { [orderByField]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return ok(paginated(rows.map(serializeCustomer), total, page, pageSize));
});

export const POST = withAuth(async (req, { user }) => {
  const input = await parseBody(req, customerSchema);

  const customer = await prisma.customer.create({
    data: {
      name: input.name,
      mobileNumber: input.mobileNumber,
      whatsappNumber: input.whatsappNumber ?? input.mobileNumber,
      address: input.address,
      notes: input.notes,
      createdById: user.id,
    },
    include,
  });

  return created(serializeCustomer(customer));
});
