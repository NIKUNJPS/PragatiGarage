import { z } from 'zod';

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

/** Money coming from a form input: accepts "1,250.50" or 1250.5 */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim() || 0)))
  .refine((v) => Number.isFinite(v), { message: 'Enter a valid amount.' })
  .refine((v) => v >= 0, { message: 'Amount cannot be negative.' })
  .refine((v) => v <= 99_999_999, { message: 'That amount looks too large.' });

export const quantitySchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : Number(String(v).trim() || 0)))
  .refine((v) => Number.isFinite(v) && v > 0, { message: 'Quantity must be greater than zero.' })
  .refine((v) => v <= 100_000, { message: 'Quantity looks too large.' });

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

export const createInvoiceSchema = z.object({
  jobCardId: z.string().min(1, 'A job card is required.'),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item.'),
  taxRate: z.coerce.number().min(0, 'Cannot be negative.').max(100, 'Cannot exceed 100%.').default(0),
  discount: moneySchema.default(0),
  notes: trimmed(500).optional().or(z.literal('')).transform((v) => v || undefined),
  paymentStatus: z.enum(['PAID', 'UNPAID']).default('UNPAID'),
  paymentMethod: trimmed(40).optional().or(z.literal('')).transform((v) => v || undefined),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/**
 * Direct invoice entry - create a fully-typed invoice (and its job card) in one
 * step without first opening a job card. Supports back-dating via `issueDate`,
 * so historical bills can be entered by hand with the correct date. The same
 * vehicle number is reused (each entry is a new dated visit).
 */
export const directInvoiceSchema = z.object({
  vehicleId: z.string().min(1, 'Choose or add a vehicle.'),
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
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item.'),
  taxRate: z.coerce.number().min(0, 'Cannot be negative.').max(100, 'Cannot exceed 100%.').default(0),
  discount: moneySchema.default(0),
  notes: trimmed(500).optional().or(z.literal('')).transform((v) => v || undefined),
  paymentStatus: z.enum(['PAID', 'UNPAID']).default('UNPAID'),
  paymentMethod: trimmed(40).optional().or(z.literal('')).transform((v) => v || undefined),
});
export type DirectInvoiceInput = z.infer<typeof directInvoiceSchema>;

/** Client-side form schema for editing an existing invoice's line items & totals. */
export const editInvoiceFormSchema = z.object({
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item.'),
  taxRate: z.coerce.number().min(0, 'Cannot be negative.').max(100, 'Cannot exceed 100%.').default(0),
  discount: moneySchema.default(0),
  paymentStatus: z.enum(['PAID', 'UNPAID']).default('UNPAID'),
  paymentMethod: trimmed(40).optional().or(z.literal('')).transform((v) => v || undefined),
  notes: trimmed(500).optional().or(z.literal('')).transform((v) => v || undefined),
});
export type EditInvoiceFormInput = z.infer<typeof editInvoiceFormSchema>;

export const updateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item.').optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  discount: moneySchema.optional(),
  notes: trimmed(500).optional().nullable(),
  paymentStatus: z.enum(['PAID', 'UNPAID']).optional(),
  paymentMethod: trimmed(40).optional().nullable(),
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

export const invoiceListQuerySchema = listQuerySchema.extend({
  paymentStatus: z.enum(['PAID', 'UNPAID', 'ALL']).optional().default('ALL'),
  from: z.string().optional(),
  to: z.string().optional(),
  customerId: z.string().optional(),
});

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
