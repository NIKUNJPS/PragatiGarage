import { z } from 'zod';

import { MAX_AMOUNT, MAX_QUANTITY, PAYMENT_METHODS } from '@/lib/billing';
import { decimalPlaces } from '@/lib/money';
import { isDateKey, isMonthKey, resolveTimeZone } from '@/lib/timezone';
import { normalizeVehicleNumber } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

const trimmed = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);

/**
 * Accepts a local 10-digit number or an international one with a country code.
 * Spaces, dashes, brackets and a leading + are all tolerated.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Mobile number is required.')
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => /^\+?\d{10,15}$/.test(v), {
    message: 'Enter a valid 10-digit mobile number (a country code like +91 is allowed).',
  });

export const optionalPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => v === '' || /^\+?\d{10,15}$/.test(v), {
    message: 'Enter a valid mobile number, or leave this blank.',
  })
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .email('Enter a valid email address.')
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Passwords can be at most 72 characters.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: 'Include at least one letter and one number.',
  });

const toDecimalNumber = (v: string | number) =>
  typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim() || 0);

/** Money coming from a form input: accepts "1,250.50" or 1250.5, at most 2 decimals. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .refine((v) => decimalPlaces(v) <= 2, { message: 'Use at most 2 decimal places.' })
  .transform(toDecimalNumber)
  .refine((v) => Number.isFinite(v), { message: 'Enter a valid amount.' })
  .refine((v) => v >= 0, { message: 'Amount cannot be negative.' })
  .refine((v) => v <= MAX_AMOUNT, { message: 'That amount looks too large.' });

/** A strictly positive amount (payments). */
export const positiveMoneySchema = moneySchema.refine((v) => v > 0, {
  message: 'Amount must be greater than zero.',
});

export const quantitySchema = z
  .union([z.string(), z.number()])
  .refine((v) => decimalPlaces(v) <= 2, { message: 'Use at most 2 decimal places.' })
  .transform((v) => (typeof v === 'number' ? v : Number(String(v).trim() || 0)))
  .refine((v) => Number.isFinite(v) && v > 0, { message: 'Quantity must be greater than zero.' })
  .refine((v) => v <= MAX_QUANTITY, { message: 'Quantity looks too large.' });

const optionalInt = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  })
  .refine((v) => v === undefined || v >= 0, { message: 'Enter a positive whole number.' });

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const firstAdminSchema = z.object({
  name: trimmed(80).min(2, 'Enter your name.'),
  email: emailSchema,
  password: passwordSchema,
});
export type FirstAdminInput = z.infer<typeof firstAdminSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'This reset link is not valid.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

/* -------------------------------------------------------------------------- */
/* Users (staff management)                                                    */
/* -------------------------------------------------------------------------- */

export const createUserSchema = z.object({
  name: trimmed(80).min(2, 'Enter a name.'),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
});

export const updateUserSchema = z.object({
  name: trimmed(80).min(2, 'Enter a name.').optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Garage settings                                                             */
/* -------------------------------------------------------------------------- */

export const garageSchema = z.object({
  name: trimmed(120).min(2, 'Garage name is required.'),
  address: trimmed(400).optional().default(''),
  phone: optionalPhoneSchema,
  whatsappNumber: optionalPhoneSchema,
  gstNumber: trimmed(30).optional().default(''),
  tagline: trimmed(120).optional().default(''),
  email: z.union([emailSchema, z.literal('')]).optional().default(''),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED', 'AUD', 'CAD']).default('INR'),
  invoicePrefix: trimmed(12).min(1, 'Invoice prefix is required.'),
  invoiceNextNumber: z.coerce.number().int().min(1, 'Must be 1 or higher.'),
  jobCardPrefix: trimmed(12).min(1, 'Job card prefix is required.'),
  jobCardNextNumber: z.coerce.number().int().min(1, 'Must be 1 or higher.'),
  defaultTaxRate: z.coerce.number().min(0, 'Cannot be negative.').max(100, 'Cannot exceed 100%.'),
  invoiceTerms: trimmed(600).optional().default(''),
  sessionTimeoutMin: z.coerce
    .number()
    .int()
    .min(5, 'Minimum 5 minutes.')
    .max(1440, 'Maximum 24 hours.')
    .default(120),
});
export type GarageInput = z.infer<typeof garageSchema>;

export const setupWizardSchema = garageSchema.partial().extend({
  name: trimmed(120).min(2, 'Garage name is required.'),
  logoUrl: z.string().optional().nullable(),
  setupCompleted: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

export const customerSchema = z.object({
  name: trimmed(120).min(2, 'Customer name is required.'),
  mobileNumber: phoneSchema,
  whatsappNumber: optionalPhoneSchema,
  address: trimmed(400).optional().or(z.literal('')).transform((v) => v || undefined),
  notes: trimmed(1000).optional().or(z.literal('')).transform((v) => v || undefined),
});
export type CustomerInput = z.infer<typeof customerSchema>;

/* -------------------------------------------------------------------------- */
/* Vehicles                                                                    */
/* -------------------------------------------------------------------------- */

export const vehicleSchema = z.object({
  vehicleNumber: z
    .string()
    .trim()
    .min(4, 'Vehicle number is required.')
    .max(20, 'Vehicle number is too long.')
    .transform(normalizeVehicleNumber)
    .refine((v) => /^[A-Z0-9]+$/.test(v), {
      message: 'Use letters and numbers only, for example MH12AB1234.',
    }),
  vehicleType: z.enum(['BIKE', 'CAR'], { required_error: 'Choose bike or car.' }),
  brand: trimmed(60).optional().default(''),
  model: trimmed(60).optional().default(''),
  year: optionalInt.refine((v) => v === undefined || (v >= 1950 && v <= new Date().getFullYear() + 1), {
    message: 'Enter a valid year.',
  }),
  color: trimmed(40).optional().or(z.literal('')).transform((v) => v || undefined),
  odometer: optionalInt,
  customerId: z.string().min(1, 'Choose the customer who owns this vehicle.'),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

/* -------------------------------------------------------------------------- */
/* Job cards                                                                   */
/* -------------------------------------------------------------------------- */

export const partSchema = z.object({
  id: z.string().optional(),
  partName: trimmed(120).min(1, 'Part name is required.'),
  quantity: quantitySchema,
  unitPrice: moneySchema,
});

export const chargeSchema = z.object({
  id: z.string().optional(),
  description: trimmed(160).min(1, 'Description is required.'),
  amount: moneySchema,
});

export const jobCardSchema = z.object({
  vehicleId: z.string().min(1, 'Choose a vehicle.'),
  complaint: trimmed(2000).optional().default(''),
  workPerformed: trimmed(2000).optional().default(''),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),
  odometer: optionalInt,
  parts: z.array(partSchema).max(100, 'Too many parts on one job card.').default([]),
  labourCharges: z.array(chargeSchema).max(50).default([]),
  serviceCharges: z.array(chargeSchema).max(50).default([]),
});
export type JobCardInput = z.infer<typeof jobCardSchema>;

export const jobStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

export const invoiceItemSchema = z.object({
  kind: z.enum(['PART', 'LABOUR', 'SERVICE']),
  description: trimmed(160).min(1, 'Description is required.'),
  quantity: quantitySchema,
  unitPrice: moneySchema,
});

export const paymentMethodSchema = z.enum(PAYMENT_METHODS, {
  errorMap: () => ({ message: 'Choose a payment method.' }),
});

const taxRateSchema = z
  .union([z.string(), z.number()])
  .refine((v) => decimalPlaces(v) <= 2, { message: 'Use at most 2 decimal places.' })
  .transform(toDecimalNumber)
  .refine((v) => Number.isFinite(v) && v >= 0, { message: 'Cannot be negative.' })
  .refine((v) => v <= 100, { message: 'Cannot exceed 100%.' });

const optionalText = (max: number) =>
  trimmed(max).optional().or(z.literal('')).transform((v) => v || undefined);

/** Inner whitespace is collapsed so reports group "Ramesh  K" with "Ramesh K". */
const collapseSpaces = (v: string) => v.replace(/\s+/g, ' ');
const BILLED_BY_REQUIRED = 'Enter the name of the person making this bill.';

/**
 * Who worked on the vehicle and who made the bill. The app runs on one shared
 * owner login, so these names are typed on the bill rather than taken from the
 * session. "Bill created by" is required on every new bill.
 */
const staffFields = {
  attendantName: trimmed(80).optional().transform((v) => (v ? collapseSpaces(v) : undefined)),
  billedByName: z
    .string({ required_error: BILLED_BY_REQUIRED })
    .trim()
    .min(2, BILLED_BY_REQUIRED)
    .max(80, 'Keep this under 80 characters.')
    .transform(collapseSpaces),
};

/**
 * On edit both names may be changed or cleared (older bills never had them).
 * Omitted = leave as is; empty or null = clear.
 */
const editableName = trimmed(80)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? collapseSpaces(v) : null));

/**
 * Billing fields shared by every invoice write. Totals are never accepted from
 * the client; `expectedTotal` is only compared against the server's own
 * calculation so a stale or buggy screen can never save a different amount
 * than the one the user saw.
 */
const billingFields = {
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item.').max(200),
  taxRate: taxRateSchema.default(0),
  discountType: z.enum(['NONE', 'PERCENT', 'FIXED']).optional(),
  discountValue: moneySchema.optional(),
  /** Legacy fixed-amount discount, still accepted from older clients. */
  discount: moneySchema.optional(),
  expectedTotal: moneySchema.optional(),
  notes: optionalText(500),
};

/** Payment taken at the moment the invoice is created. */
const initialPaymentFields = {
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).default('UNPAID'),
  paymentAmount: moneySchema.optional(),
  paymentMethod: z.union([paymentMethodSchema, z.literal('')]).optional().transform((v) => v || undefined),
  paymentReference: optionalText(80),
  /** Per-submit key so a double-click cannot create two invoices' worth of payments. */
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
};

function refineInitialPayment(
  data: { paymentStatus: string; paymentAmount?: number; paymentMethod?: string },
  ctx: z.RefinementCtx,
) {
  if (data.paymentStatus === 'UNPAID') return;
  if (!data.paymentMethod) {
    ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Choose how the customer paid.' });
  }
  if (data.paymentStatus === 'PARTIAL' && !(data.paymentAmount && data.paymentAmount > 0)) {
    ctx.addIssue({ code: 'custom', path: ['paymentAmount'], message: 'Enter the amount received.' });
  }
}

export const createInvoiceSchema = z
  .object({
    jobCardId: z.string().min(1, 'A job card is required.').max(64),
    ...billingFields,
    ...staffFields,
    ...initialPaymentFields,
  })
  .superRefine(refineInitialPayment);
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/**
 * Direct invoice entry - create a fully-typed invoice (and its job card) in one
 * step without first opening a job card. Supports back-dating via `issueDate`,
 * so historical bills can be entered by hand with the correct date. The same
 * vehicle number is reused (each entry is a new dated visit).
 */
export const directInvoiceSchema = z
  .object({
  vehicleId: z.string().min(1, 'Choose or add a vehicle.').max(64),
  issueDate: z
    .string()
    .optional()
    .transform((v) => {
      const s = (v ?? '').trim();
      if (!s) return new Date();
      const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : s;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return new Date();
      // Never let a bill be dated in the future.
      return d.getTime() > Date.now() ? new Date() : d;
    }),
  complaint: trimmed(2000).optional().default(''),
  workPerformed: trimmed(2000).optional().default(''),
  odometer: optionalInt,
  ...billingFields,
  ...staffFields,
  ...initialPaymentFields,
  })
  .superRefine(refineInitialPayment);
export type DirectInvoiceInput = z.infer<typeof directInvoiceSchema>;

/** Client-side form schema for editing an existing invoice's line items & totals. */
export const editInvoiceFormSchema = z.object({
  ...billingFields,
  attendantName: editableName,
  billedByName: editableName,
  /** Required when the new total is below what the customer has already paid. */
  confirmOverpayment: z.boolean().optional(),
});
export type EditInvoiceFormInput = z.infer<typeof editInvoiceFormSchema>;

export const updateInvoiceSchema = z.object({
  items: billingFields.items.optional(),
  taxRate: taxRateSchema.optional(),
  discountType: billingFields.discountType,
  discountValue: billingFields.discountValue,
  discount: billingFields.discount,
  expectedTotal: billingFields.expectedTotal,
  notes: trimmed(500).optional().nullable(),
  attendantName: editableName,
  billedByName: editableName,
  confirmOverpayment: z.boolean().optional(),
  /**
   * Legacy manual status toggle, validated against real money: PAID records a
   * payment for the balance due, UNPAID voids the recorded payments.
   */
  paymentStatus: z.enum(['PAID', 'UNPAID']).optional(),
  paymentMethod: z.union([paymentMethodSchema, z.literal('')]).optional().nullable().transform((v) => v || undefined),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const recordPaymentSchema = z.object({
  amount: positiveMoneySchema,
  method: paymentMethodSchema,
  paidAt: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid payment date.' });
        return z.NEVER;
      }
      if (d.getTime() > Date.now() + 5 * 60_000) {
        ctx.addIssue({ code: 'custom', message: 'Payment date cannot be in the future.' });
        return z.NEVER;
      }
      return d;
    }),
  reference: optionalText(80),
  notes: optionalText(300),
  idempotencyKey: z.string().trim().min(8, 'Missing submission key.').max(80),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const voidPaymentSchema = z.object({
  reason: trimmed(200).min(3, 'Say why this payment is being voided.'),
});

export const paymentConfirmationSchema = z.object({
  /** Explicitly re-send a confirmation that was already sent. */
  resend: z.boolean().optional().default(false),
  whatsappNumber: optionalPhoneSchema,
});

/* -------------------------------------------------------------------------- */
/* List queries                                                                */
/* -------------------------------------------------------------------------- */

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  includeArchived: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});

export const vehicleListQuerySchema = listQuerySchema.extend({
  vehicleType: z.enum(['BIKE', 'CAR', 'ALL']).optional().default('ALL'),
  customerId: z.string().optional(),
});

export const jobCardListQuerySchema = listQuerySchema.extend({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'ACTIVE', 'ALL']).optional().default('ALL'),
  from: z.string().optional(),
  to: z.string().optional(),
  customerId: z.string().optional(),
  vehicleId: z.string().optional(),
});

/** The viewer's IANA time zone, so "a day" means the garage's local day. Unknown -> garage default. */
const timeZoneParam = z.string().trim().max(64).optional().transform(resolveTimeZone);

export const invoiceListQuerySchema = listQuerySchema.extend({
  /** DUE = anything with money outstanding (UNPAID or PARTIAL). */
  paymentStatus: z.enum(['PAID', 'UNPAID', 'PARTIAL', 'DUE', 'ALL']).optional().default('ALL'),
  from: z.string().optional(),
  to: z.string().optional(),
  tz: timeZoneParam,
  customerId: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export const dailyReportQuerySchema = z.object({
  /** Defaults to today in `tz`; a future date is treated as today. */
  date: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isDateKey(v), { message: 'Use a date like 2026-10-06.' }),
  tz: timeZoneParam,
});

export const monthlyReportQuerySchema = z.object({
  /** Defaults to the current month in `tz`; a future month is treated as this month. */
  month: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isMonthKey(v), { message: 'Use a month like 2026-10.' }),
  tz: timeZoneParam,
});

export const dashboardQuerySchema = z.object({ tz: timeZoneParam });

/* -------------------------------------------------------------------------- */
/* Bulk import (historical / past data)                                        */
/* -------------------------------------------------------------------------- */

/** Bike vs car, tolerant of common ways people write it in a spreadsheet. */
const importVehicleType = z.preprocess((v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 'BIKE';
  if (/(^|[^a-z])(car|4|four)/.test(s)) return 'CAR';
  return 'BIKE';
}, z.enum(['BIKE', 'CAR']));

const importOptionalInt = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || String(v).trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  });

const importOptionalMoney = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || String(v).trim() === '') return undefined;
    const n = Number(String(v).replace(/[,\s]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  });

const importOptionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const s = String(v ?? '').trim();
    if (!s) return undefined;
    // Accept YYYY-MM-DD and DD/MM/YYYY (and DD-MM-YYYY).
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : s;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  });

/**
 * One row of a past-data import: a customer + a vehicle, and optionally a single
 * historical service record (which becomes a completed job card + paid invoice
 * so old revenue and service history show up correctly).
 */
export const importRowSchema = z.object({
  customerName: trimmed(120).min(2, 'Customer name is required.'),
  mobileNumber: phoneSchema,
  whatsappNumber: optionalPhoneSchema,
  address: trimmed(400).optional().or(z.literal('')).transform((v) => v || undefined),
  vehicleNumber: z
    .string()
    .trim()
    .min(4, 'Vehicle number is required.')
    .max(20, 'Vehicle number is too long.')
    .transform(normalizeVehicleNumber)
    .refine((v) => /^[A-Z0-9]+$/.test(v), { message: 'Use letters and numbers only.' }),
  vehicleType: importVehicleType,
  brand: trimmed(60).optional().or(z.literal('')).transform((v) => v || ''),
  model: trimmed(60).optional().or(z.literal('')).transform((v) => v || ''),
  year: importOptionalInt,
  odometer: importOptionalInt,
  lastServiceDate: importOptionalDate,
  lastServiceNote: trimmed(300).optional().or(z.literal('')).transform((v) => v || undefined),
  lastServiceAmount: importOptionalMoney,
});
export type ImportRow = z.infer<typeof importRowSchema>;

/** The API validates each row individually, so the batch itself stays loose. */
export const importPayloadSchema = z.object({
  rows: z.array(z.record(z.any())).min(1, 'Add at least one row.').max(1000, 'Import up to 1000 rows at a time.'),
  markServicesPaid: z.boolean().optional().default(true),
});
