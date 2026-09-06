import { prisma } from '@/lib/prisma';
import { ok, withAuth } from '@/lib/api';
import { normalizeVehicleNumber, toNumber } from '@/lib/utils';
import type { SearchResults } from '@/types';

export const dynamic = 'force-dynamic';

const EMPTY: SearchResults = { customers: [], vehicles: [], jobCards: [], invoices: [] };

/** Powers the header's global search across every record type at once. */
export const GET = withAuth(async (req) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return ok(EMPTY);

  const digits = q.replace(/\D/g, '');
  const plate = normalizeVehicleNumber(q);

  const [customers, vehicles, jobCards, invoices] = await Promise.all([
    prisma.customer.findMany({
      where: {
        isArchived: false,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          ...(digits ? [{ mobileNumber: { contains: digits } }] : []),
        ],
      },
      select: { id: true, name: true, mobileNumber: true },
      take: 5,
    }),
    prisma.vehicle.findMany({
      where: {
        isArchived: false,
        OR: [
          { vehicleNumber: { contains: plate } },
          { brand: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        vehicleNumber: true,
        brand: true,
        model: true,
        customer: { select: { name: true } },
      },
      take: 5,
    }),
    prisma.jobCard.findMany({
      where: {
        isArchived: false,
        OR: [
          { jobCardNumber: { contains: q, mode: 'insensitive' } },
          { vehicle: { vehicleNumber: { contains: plate } } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        jobCardNumber: true,
        status: true,
        vehicle: { select: { vehicleNumber: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.invoice.findMany({
      where: {
        isArchived: false,
        OR: [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
        paymentStatus: true,
        totalAmount: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const results: SearchResults = {
    customers,
    vehicles: vehicles.map((v) => ({
      id: v.id,
      vehicleNumber: v.vehicleNumber,
      brand: v.brand,
      model: v.model,
      customerName: v.customer.name,
    })),
    jobCards: jobCards.map((j) => ({
      id: j.id,
      jobCardNumber: j.jobCardNumber,
      status: j.status,
      vehicleNumber: j.vehicle.vehicleNumber,
      customerName: j.customer.name,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      paymentStatus: i.paymentStatus,
      customerName: i.customer.name,
      totalAmount: toNumber(i.totalAmount),
    })),
  };

  return ok(results);
});
