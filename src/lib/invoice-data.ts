import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getGarage } from '@/lib/garage';
import type { DiscountType, PaymentStatus } from '@/lib/billing';
import { fromPaise, toPaise } from '@/lib/money';
import { toNumber } from '@/lib/utils';

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
  /** Used to store a generated PDF only if the invoice has not changed since. */
  updatedAt: string;
  paidAt: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  notes: string | null;
  /** Gross amount before discount and tax. */
  subtotal: number;
  taxRate: number;
  tax: number;
  discountType: DiscountType;
  discountValue: number;
  /** Resolved discount amount. */
  discount: number;
  /** Final payable amount. */
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  excessPaid: number;
  isArchived: boolean;
  pdfUrl: string | null;
  items: InvoiceLine[];
  /** Internal only - empty on the public customer link. */
  payments: InvoicePayment[];
  /** Internal only - empty on the public customer link. */
  activity: InvoiceActivity[];
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

export interface InvoicePayment {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  confirmationSentAt: string | null;
  confirmationChannel: string | null;
  confirmationCount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface InvoiceActivity {
  id: string;
  action: string;
  createdAt: string;
  user: string | null;
  oldValue: unknown;
  newValue: unknown;
}

export const invoiceInclude = {
  items: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
  customer: true,
  jobCard: { include: { vehicle: true } },
  payments: {
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    include: { createdBy: { select: { name: true } } },
  },
  auditLogs: {
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { name: true } } },
  },
} satisfies Prisma.InvoiceInclude;

type LoadedInvoice = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export async function buildInvoiceView(
  invoice: LoadedInvoice,
  { internal = true }: { internal?: boolean } = {},
): Promise<InvoiceView> {
  const garage = await getGarage();
  const totalAmount = toNumber(invoice.totalAmount);
  const amountPaid = toNumber(invoice.amountPaid);

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    publicToken: invoice.publicToken,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod,
    notes: invoice.notes,
    subtotal: toNumber(invoice.subtotal),
    taxRate: toNumber(invoice.taxRate),
    tax: toNumber(invoice.tax),
    discountType: invoice.discountType,
    discountValue: toNumber(invoice.discountValue),
    discount: toNumber(invoice.discount),
    totalAmount,
    amountPaid,
    balanceDue: toNumber(invoice.balanceDue),
    excessPaid: fromPaise(Math.max(toPaise(amountPaid) - toPaise(totalAmount), 0)),
    isArchived: invoice.isArchived,
    pdfUrl: invoice.pdfUrl,
    payments: internal
      ? invoice.payments.map((p) => ({
          id: p.id,
          amount: toNumber(p.amount),
          method: p.method,
          paidAt: p.paidAt.toISOString(),
          reference: p.reference,
          notes: p.notes,
          isVoided: p.isVoided,
          voidedAt: p.voidedAt?.toISOString() ?? null,
          voidReason: p.voidReason,
          confirmationSentAt: p.confirmationSentAt?.toISOString() ?? null,
          confirmationChannel: p.confirmationChannel,
          confirmationCount: p.confirmationCount,
          createdBy: p.createdBy?.name ?? null,
          createdAt: p.createdAt.toISOString(),
        }))
      : [],
    activity: internal
      ? invoice.auditLogs.map((a) => ({
          id: a.id,
          action: a.action,
          createdAt: a.createdAt.toISOString(),
          user: a.user?.name ?? null,
          oldValue: a.oldValue,
          newValue: a.newValue,
        }))
      : [],
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

/** Public customer link: same saved figures, without payment notes or the audit trail. */
export async function getInvoiceViewByToken(token: string): Promise<InvoiceView | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: invoiceInclude,
  });
  return invoice ? buildInvoiceView(invoice, { internal: false }) : null;
}

export const KIND_LABELS: Record<InvoiceLine['kind'], string> = {
  PART: 'Part',
  LABOUR: 'Labour',
  SERVICE: 'Service',
};
