/**
 * Typed API contracts shared by the server routes and the React client.
 * Everything the API returns is plain JSON: Decimals become numbers and Dates
 * become ISO strings, which keeps client components free of Prisma types.
 */

export type Role = 'ADMIN' | 'STAFF';
export type VehicleType = 'BIKE' | 'CAR';
export type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type PaymentStatus = 'PAID' | 'UNPAID';
export type InvoiceItemKind = 'PART' | 'LABOUR' | 'SERVICE';

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SessionUserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface MeResponse {
  user: SessionUserDTO;
  garage: GarageDTO;
}

export interface GarageDTO {
  id: string;
  name: string;
  address: string;
  phone: string;
  whatsappNumber: string;
  gstNumber: string;
  email: string;
  tagline: string;
  logoUrl: string | null;
  currency: string;
  invoicePrefix: string;
  invoiceNextNumber: number;
  jobCardPrefix: string;
  jobCardNextNumber: number;
  defaultTaxRate: number;
  invoiceTerms: string;
  sessionTimeoutMin: number;
  setupCompleted: boolean;
  nextInvoiceNumberPreview: string;
  nextJobCardNumberPreview: string;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CustomerDTO {
  id: string;
  name: string;
  mobileNumber: string;
  whatsappNumber: string | null;
  address: string | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  vehicleCount: number;
  jobCardCount: number;
  totalBilled: number;
  outstanding: number;
}

export interface CustomerDetailDTO extends CustomerDTO {
  vehicles: VehicleDTO[];
  jobCards: JobCardListItemDTO[];
  invoices: InvoiceListItemDTO[];
  paidTotal: number;
  lastVisitAt: string | null;
}

export interface VehicleDTO {
  id: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  odometer: number | null;
  isArchived: boolean;
  createdAt: string;
  customer: { id: string; name: string; mobileNumber: string };
  jobCardCount: number;
  lastServiceAt: string | null;
}

export interface VehicleDetailDTO extends VehicleDTO {
  jobCards: JobCardListItemDTO[];
  totalBilled: number;
}

export interface LineItemDTO {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface JobCardListItemDTO {
  id: string;
  jobCardNumber: string;
  status: JobStatus;
  complaint: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  isArchived: boolean;
  total: number;
  customer: { id: string; name: string; mobileNumber: string };
  vehicle: { id: string; vehicleNumber: string; vehicleType: VehicleType; brand: string; model: string };
  invoice: { id: string; invoiceNumber: string; paymentStatus: PaymentStatus } | null;
  createdBy: string | null;
}

export interface JobCardDetailDTO extends JobCardListItemDTO {
  workPerformed: string;
  odometer: number | null;
  parts: Array<LineItemDTO & { partName: string }>;
  labourCharges: Array<{ id: string; description: string; amount: number }>;
  serviceCharges: Array<{ id: string; description: string; amount: number }>;
  partsTotal: number;
  labourTotal: number;
  serviceTotal: number;
  customerFull: CustomerDTO;
  vehicleFull: VehicleDTO;
}

export interface InvoiceListItemDTO {
  id: string;
  invoiceNumber: string;
  publicToken: string;
  createdAt: string;
  paidAt: string | null;
  paymentStatus: PaymentStatus;
  subtotal: number;
  tax: number;
  discount: number;
  totalAmount: number;
  isArchived: boolean;
  customer: { id: string; name: string; mobileNumber: string; whatsappNumber: string | null };
  vehicle: { id: string; vehicleNumber: string };
  jobCard: { id: string; jobCardNumber: string };
}

export interface DashboardStats {
  totalCustomers: number;
  totalVehicles: number;
  activeJobs: number;
  pendingJobs: number;
  inProgressJobs: number;
  todayRevenue: number;
  monthRevenue: number;
  unpaidCount: number;
  unpaidAmount: number;
  currency: string;
  recentJobCards: JobCardListItemDTO[];
}

export interface SearchResults {
  customers: Array<{ id: string; name: string; mobileNumber: string }>;
  vehicles: Array<{ id: string; vehicleNumber: string; brand: string; model: string; customerName: string }>;
  jobCards: Array<{ id: string; jobCardNumber: string; status: JobStatus; vehicleNumber: string; customerName: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; paymentStatus: PaymentStatus; customerName: string; totalAmount: number }>;
}

export interface ShareInvoiceResponse {
  waLink: string;
  shareUrl: string;
  pdfUrl: string;
  message: string;
  sentDirectly: boolean;
  whatsappNumber: string;
}
