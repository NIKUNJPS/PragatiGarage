import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getGarage } from '@/lib/garage';
import { round2, toNumber } from '@/lib/utils';

export interface InvoiceLine {
  id: string;
  kind: 'PART' | 'LABOUR' | 'SERVICE';
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceView {
  id: string;
  invoiceNumber: string;
  publicToken: string;
  createdAt: string;
  paidAt: string | null;
  paymentStatus: 'PAID' | 'UNPAID';
  paymentMethod: string | null;
  notes: string | null;
  subtotal: number;
  taxRate: number;
  tax: number;
  discount: number;
  totalAmount: number;
  pdfUrl: string | null;
  items: InvoiceLine[];
  customer: {
    id: string;
    name: string;
    mobileNumber: string;
    whatsappNumber: string | null;
    address: string | null;
  };
  vehicle: {
    id: string;
    vehicleNumber: string;
    vehicleType: 'BIKE' | 'CAR';
    brand: string;
    model: string;
    odometer: number | null;
  };
  jobCard: {
    id: string;
    jobCardNumber: string;
    complaint: string;
    workPerformed: string;
    createdAt: string;
  };
  garage: {
    name: string;
    address: string;
    phone: string;
    whatsappNumber: string;
    gstNumber: string;
    email: string;
    tagline: string;
    logoUrl: string | null;
    currency: string;
    invoiceTerms: string;
  };
}

const invoiceInclude = {
  items: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
  customer: true,
  jobCard: { include: { vehicle: true } },
} satisfies Prisma.InvoiceInclude;

type LoadedInvoice = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export async function buildInvoiceView(invoice: LoadedInvoice): Promise<InvoiceView> {
  const garage = await getGarage();

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    publicToken: invoice.publicToken,
    createdAt: invoice.createdAt.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod,
    notes: invoice.notes,
    subtotal: toNumber(invoice.subtotal),
    taxRate: toNumber(invoice.taxRate),
    tax: toNumber(invoice.tax),
    discount: toNumber(invoice.discount),
    totalAmount: toNumber(invoice.totalAmount),
    pdfUrl: invoice.pdfUrl,
    items: invoice.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      total: toNumber(item.total),
    })),
    customer: {
      id: invoice.customer.id,
      name: invoice.customer.name,
      mobileNumber: invoice.customer.mobileNumber,
      whatsappNumber: invoice.customer.whatsappNumber,
      address: invoice.customer.address,
    },
    vehicle: {
      id: invoice.jobCard.vehicle.id,
      vehicleNumber: invoice.jobCard.vehicle.vehicleNumber,
      vehicleType: invoice.jobCard.vehicle.vehicleType,
      brand: invoice.jobCard.vehicle.brand,
      model: invoice.jobCard.vehicle.model,
      odometer: invoice.jobCard.odometer ?? invoice.jobCard.vehicle.odometer,
    },
    jobCard: {
      id: invoice.jobCard.id,
      jobCardNumber: invoice.jobCard.jobCardNumber,
      complaint: invoice.jobCard.complaint,
      workPerformed: invoice.jobCard.workPerformed,
      createdAt: invoice.jobCard.createdAt.toISOString(),
    },
    garage: {
      name: garage.name,
      address: garage.address,
      phone: garage.phone,
      whatsappNumber: garage.whatsappNumber,
      gstNumber: garage.gstNumber,
      email: garage.email,
      tagline: garage.tagline,
      logoUrl: garage.logoUrl,
      currency: garage.currency,
      invoiceTerms: garage.invoiceTerms,
    },
  };
}

export async function getInvoiceViewById(id: string): Promise<InvoiceView | null> {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
  return invoice ? buildInvoiceView(invoice) : null;
}

export async function getInvoiceViewByToken(token: string): Promise<InvoiceView | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: invoiceInclude,
  });
  return invoice ? buildInvoiceView(invoice) : null;
}

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  discount: number;
  totalAmount: number;
}

/**
 * Single source of truth for invoice arithmetic. The server always recomputes
 * these from the line items - a client-supplied total is never trusted.
 */
export function computeTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number,
  discount: number,
): InvoiceTotals {
  const subtotal = round2(
    items.reduce((sum, item) => sum + round2(item.quantity * item.unitPrice), 0),
  );
  const safeDiscount = round2(Math.min(Math.max(discount, 0), subtotal));
  const taxable = round2(subtotal - safeDiscount);
  const tax = round2((taxable * taxRate) / 100);
  return {
    subtotal,
    tax,
    discount: safeDiscount,
    totalAmount: round2(taxable + tax),
  };
}

export const KIND_LABELS: Record<InvoiceLine['kind'], string> = {
  PART: 'Part',
  LABOUR: 'Labour',
  SERVICE: 'Service',
};
