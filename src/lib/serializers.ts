import type { Garage } from '@prisma/client';

import { formatDocumentNumber } from '@/lib/garage';
import { round2, toNumber } from '@/lib/utils';
import type {
  CustomerDTO,
  GarageDTO,
  InvoiceListItemDTO,
  JobCardDetailDTO,
  JobCardListItemDTO,
  UserDTO,
  VehicleDTO,
} from '@/types';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function serializeGarage(g: Garage): GarageDTO {
  return {
    id: g.id,
    name: g.name,
    address: g.address,
    phone: g.phone,
    whatsappNumber: g.whatsappNumber,
    gstNumber: g.gstNumber,
    email: g.email,
    logoUrl: g.logoUrl,
    currency: g.currency,
    invoicePrefix: g.invoicePrefix,
    invoiceNextNumber: g.invoiceNextNumber,
    jobCardPrefix: g.jobCardPrefix,
    jobCardNextNumber: g.jobCardNextNumber,
    defaultTaxRate: toNumber(g.defaultTaxRate),
    invoiceTerms: g.invoiceTerms,
    sessionTimeoutMin: g.sessionTimeoutMin,
    setupCompleted: g.setupCompleted,
    nextInvoiceNumberPreview: formatDocumentNumber(g.invoicePrefix, g.invoiceNextNumber),
    nextJobCardNumberPreview: formatDocumentNumber(g.jobCardPrefix, g.jobCardNextNumber),
  };
}

export function serializeUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as UserDTO['role'],
    isActive: u.isActive,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

export interface CustomerRow {
  id: string;
  name: string;
  mobileNumber: string;
  whatsappNumber: string | null;
  address: string | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: Date;
  _count?: { vehicles: number; jobCards: number };
  invoices?: Array<{ totalAmount: unknown; paymentStatus: string }>;
}

export function serializeCustomer(c: CustomerRow): CustomerDTO {
  const invoices = c.invoices ?? [];
  const totalBilled = round2(invoices.reduce((s, i) => s + toNumber(i.totalAmount as never), 0));
  const outstanding = round2(
    invoices
      .filter((i) => i.paymentStatus === 'UNPAID')
      .reduce((s, i) => s + toNumber(i.totalAmount as never), 0),
  );

  return {
    id: c.id,
    name: c.name,
    mobileNumber: c.mobileNumber,
    whatsappNumber: c.whatsappNumber,
    address: c.address,
    notes: c.notes,
    isArchived: c.isArchived,
    createdAt: c.createdAt.toISOString(),
    vehicleCount: c._count?.vehicles ?? 0,
    jobCardCount: c._count?.jobCards ?? 0,
    totalBilled,
    outstanding,
  };
}

/* -------------------------------------------------------------------------- */
/* Vehicles                                                                    */
/* -------------------------------------------------------------------------- */

export interface VehicleRow {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  odometer: number | null;
  isArchived: boolean;
  createdAt: Date;
  customer: { id: string; name: string; mobileNumber: string };
  _count?: { jobCards: number };
  jobCards?: Array<{ createdAt: Date }>;
}

export function serializeVehicle(v: VehicleRow): VehicleDTO {
  return {
    id: v.id,
    vehicleNumber: v.vehicleNumber,
    vehicleType: v.vehicleType as VehicleDTO['vehicleType'],
    brand: v.brand,
    model: v.model,
    year: v.year,
    color: v.color,
    odometer: v.odometer,
    isArchived: v.isArchived,
    createdAt: v.createdAt.toISOString(),
    customer: v.customer,
    jobCardCount: v._count?.jobCards ?? 0,
    lastServiceAt: iso(v.jobCards?.[0]?.createdAt ?? null),
  };
}

/* -------------------------------------------------------------------------- */
/* Job cards                                                                   */
/* -------------------------------------------------------------------------- */

export interface JobCardRow {
  id: string;
  jobCardNumber: string;
  status: string;
  complaint: string;
  workPerformed?: string;
  odometer?: number | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  customer: { id: string; name: string; mobileNumber: string };
  vehicle: { id: string; vehicleNumber: string; vehicleType: string; brand: string; model: string };
  parts?: Array<{ id: string; partName: string; quantity: unknown; unitPrice: unknown; total: unknown }>;
  labourCharges?: Array<{ id: string; description: string; amount: unknown }>;
  serviceCharges?: Array<{ id: string; description: string; amount: unknown }>;
  invoice?: { id: string; invoiceNumber: string; paymentStatus: string } | null;
  createdBy?: { name: string } | null;
}

export function jobCardTotals(j: JobCardRow) {
  const partsTotal = round2((j.parts ?? []).reduce((s, p) => s + toNumber(p.total as never), 0));
  const labourTotal = round2(
    (j.labourCharges ?? []).reduce((s, l) => s + toNumber(l.amount as never), 0),
  );
  const serviceTotal = round2(
    (j.serviceCharges ?? []).reduce((s, l) => s + toNumber(l.amount as never), 0),
  );
  return {
    partsTotal,
    labourTotal,
    serviceTotal,
    total: round2(partsTotal + labourTotal + serviceTotal),
  };
}

export function serializeJobCardListItem(j: JobCardRow): JobCardListItemDTO {
  const { total } = jobCardTotals(j);
  return {
    id: j.id,
    jobCardNumber: j.jobCardNumber,
    status: j.status as JobCardListItemDTO['status'],
    complaint: j.complaint,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    completedAt: iso(j.completedAt),
    isArchived: j.isArchived,
    total,
    customer: j.customer,
    vehicle: {
      id: j.vehicle.id,
      vehicleNumber: j.vehicle.vehicleNumber,
      vehicleType: j.vehicle.vehicleType as 'BIKE' | 'CAR',
      brand: j.vehicle.brand,
      model: j.vehicle.model,
    },
    invoice: j.invoice
      ? {
          id: j.invoice.id,
          invoiceNumber: j.invoice.invoiceNumber,
          paymentStatus: j.invoice.paymentStatus as 'PAID' | 'UNPAID',
        }
      : null,
    createdBy: j.createdBy?.name ?? null,
  };
}

export function serializeJobCardDetail(
  j: JobCardRow & { customerFull: CustomerRow; vehicleFull: VehicleRow },
): JobCardDetailDTO {
  const totals = jobCardTotals(j);
  return {
    ...serializeJobCardListItem(j),
    workPerformed: j.workPerformed ?? '',
    odometer: j.odometer ?? null,
    parts: (j.parts ?? []).map((p) => ({
      id: p.id,
      partName: p.partName,
      description: p.partName,
      quantity: toNumber(p.quantity as never),
      unitPrice: toNumber(p.unitPrice as never),
      total: toNumber(p.total as never),
    })),
    labourCharges: (j.labourCharges ?? []).map((l) => ({
      id: l.id,
      description: l.description,
      amount: toNumber(l.amount as never),
    })),
    serviceCharges: (j.serviceCharges ?? []).map((s) => ({
      id: s.id,
      description: s.description,
      amount: toNumber(s.amount as never),
    })),
    partsTotal: totals.partsTotal,
    labourTotal: totals.labourTotal,
    serviceTotal: totals.serviceTotal,
    customerFull: serializeCustomer(j.customerFull),
    vehicleFull: serializeVehicle(j.vehicleFull),
  };
}

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  publicToken: string;
  createdAt: Date;
  paidAt: Date | null;
  paymentStatus: string;
  subtotal: unknown;
  tax: unknown;
  discount: unknown;
  totalAmount: unknown;
  isArchived: boolean;
  customer: { id: string; name: string; mobileNumber: string; whatsappNumber: string | null };
  jobCard: {
    id: string;
    jobCardNumber: string;
    vehicle: { id: string; vehicleNumber: string };
  };
}

export function serializeInvoiceListItem(i: InvoiceRow): InvoiceListItemDTO {
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    publicToken: i.publicToken,
    createdAt: i.createdAt.toISOString(),
    paidAt: iso(i.paidAt),
    paymentStatus: i.paymentStatus as 'PAID' | 'UNPAID',
    subtotal: toNumber(i.subtotal as never),
    tax: toNumber(i.tax as never),
    discount: toNumber(i.discount as never),
    totalAmount: toNumber(i.totalAmount as never),
    isArchived: i.isArchived,
    customer: i.customer,
    vehicle: i.jobCard.vehicle,
    jobCard: { id: i.jobCard.id, jobCardNumber: i.jobCard.jobCardNumber },
  };
}
