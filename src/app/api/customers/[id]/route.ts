import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, ok, parseBody, withAuth } from '@/lib/api';
import {
  serializeCustomer,
  serializeInvoiceListItem,
  serializeJobCardListItem,
  serializeVehicle,
} from '@/lib/serializers';
import { round2, toNumber } from '@/lib/utils';
import { customerSchema } from '@/lib/validations';
import type { CustomerDetailDTO } from '@/types';

export const dynamic = 'force-dynamic';

const summaryInclude = {
  _count: { select: { vehicles: true, jobCards: true } },
  invoices: { select: { totalAmount: true, paymentStatus: true } },
} satisfies Prisma.CustomerInclude;

export const GET = withAuth(async (_req, { params }) => {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      ...summaryInclude,
      vehicles: {
        where: { isArchived: false },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, mobileNumber: true } },
          _count: { select: { jobCards: true } },
          jobCards: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      jobCards: {
        where: { isArchived: false },
        orderBy: { createdAt: 'desc' },
        take: 50,
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
      },
    },
  });

  if (!customer) throw new ApiError(404, 'That customer no longer exists.');

  const invoices = await prisma.invoice.findMany({
    where: { customerId: customer.id, isArchived: false },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      customer: {
        select: { id: true, name: true, mobileNumber: true, whatsappNumber: true },
      },
      jobCard: {
        select: {
          id: true,
          jobCardNumber: true,
          vehicle: { select: { id: true, vehicleNumber: true } },
        },
      },
    },
  });

  const base = serializeCustomer(customer);
  const paidTotal = round2(
    customer.invoices
      .filter((i) => i.paymentStatus === 'PAID')
      .reduce((s, i) => s + toNumber(i.totalAmount), 0),
  );

  const body: CustomerDetailDTO = {
    ...base,
    paidTotal,
    lastVisitAt: customer.jobCards[0]?.createdAt.toISOString() ?? null,
    vehicles: customer.vehicles.map(serializeVehicle),
    jobCards: customer.jobCards.map(serializeJobCardListItem),
    invoices: invoices.map(serializeInvoiceListItem),
  };

  return ok(body);
});

export const PATCH = withAuth(async (req, { params }) => {
  const input = await parseBody(req, customerSchema);

  const customer = await prisma.customer.update({
    where: { id: params.id },
    data: {
      name: input.name,
      mobileNumber: input.mobileNumber,
      whatsappNumber: input.whatsappNumber ?? input.mobileNumber,
      address: input.address ?? null,
      notes: input.notes ?? null,
    },
    include: summaryInclude,
  });

  return ok(serializeCustomer(customer));
});

/**
 * Archive (soft delete). Billing history must stay intact, so records are never
 * physically removed. Admin only.
 */
export const DELETE = withAuth(async (req, { params }) => {
  const url = new URL(req.url);
  const restore = url.searchParams.get('restore') === 'true';

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: { _count: { select: { jobCards: true } } },
  });
  if (!customer) throw new ApiError(404, 'That customer no longer exists.');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.customer.update({
      where: { id: params.id },
      data: { isArchived: !restore },
      include: summaryInclude,
    });
    // Archiving a customer takes their vehicles out of the pickers too, so a
    // job card can never be raised against an archived owner.
    await tx.vehicle.updateMany({
      where: { customerId: params.id },
      data: { isArchived: !restore },
    });
    return result;
  });

  return ok({
    ...serializeCustomer(updated),
    message: restore
      ? 'Customer restored.'
      : 'Customer archived. Their job cards and invoices are still available.',
  });
}, adminOnly);
