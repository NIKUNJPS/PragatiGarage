/**
 * Seed script - loads a realistic, immediately explorable demo garage.
 *
 *   npm run db:seed
 *
 * Safe to re-run: it upserts the admin/staff/garage and only creates demo
 * customers/vehicles/job-cards when the database has none, so it never piles up
 * duplicate demo data.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

// Single-login app: one owner (ADMIN) account, configured via env.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@garage.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Ramesh Raskar';

const D = (n: number) => new Prisma.Decimal(n.toFixed(2));
const daysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};
const token = () => randomBytes(18).toString('base64url');

async function main() {
  console.log('Seeding garage management system...');

  /* -------------------------------------------------- the single owner */
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: 'ADMIN',
    },
  });

  /* ------------------------------------------------------------ garage */
  await prisma.garage.upsert({
    where: { id: 'garage' },
    update: {},
    create: {
      id: 'garage',
      name: 'Pragati Auto - Raskar and Sons',
      address: 'Shop 14, MG Road, Near Bus Stand, Pune, Maharashtra 411001',
      phone: '02041234567',
      whatsappNumber: '919876543210',
      gstNumber: '27ABCDE1234F1Z5',
      email: 'pragatiauto@example.com',
      currency: 'INR',
      invoicePrefix: 'INV-{YYYY}-',
      jobCardPrefix: 'JC-{YYYY}-',
      defaultTaxRate: D(18),
      invoiceTerms:
        'Thank you for choosing Pragati Auto (Raskar and Sons). Goods once sold are not returnable. Warranty as per manufacturer policy.',
      setupCompleted: true,
    },
  });

  const existingCustomers = await prisma.customer.count();
  if (existingCustomers > 0) {
    console.log('Demo records already present - skipping demo data.');
    await summary();
    return;
  }

  /* --------------------------------------------------------- customers */
  const customerSeeds = [
    { name: 'Ramesh Kumar', mobileNumber: '9876500001', address: 'Kothrud, Pune' },
    { name: 'Priya Sharma', mobileNumber: '9876500002', address: 'Baner, Pune' },
    { name: 'Imran Shaikh', mobileNumber: '9876500003', address: 'Camp, Pune' },
    { name: 'Anjali Desai', mobileNumber: '9876500004', address: 'Hadapsar, Pune' },
    { name: 'Vikram Singh', mobileNumber: '9876500005', address: 'Wakad, Pune' },
    { name: 'Sunita Joshi', mobileNumber: '9876500006', address: 'Aundh, Pune' },
  ];

  const customers = [];
  for (const seed of customerSeeds) {
    customers.push(
      await prisma.customer.create({
        data: { ...seed, whatsappNumber: seed.mobileNumber, createdById: admin.id },
      }),
    );
  }

  /* ---------------------------------------------------------- vehicles */
  const vehicleSeeds: Array<{
    vehicleNumber: string;
    vehicleType: 'BIKE' | 'CAR';
    brand: string;
    model: string;
    year: number;
    odometer: number;
    customerIndex: number;
  }> = [
    { vehicleNumber: 'MH12AB1234', vehicleType: 'BIKE', brand: 'Honda', model: 'Activa 6G', year: 2021, odometer: 18400, customerIndex: 0 },
    { vehicleNumber: 'MH12CD5678', vehicleType: 'CAR', brand: 'Maruti Suzuki', model: 'Swift VXi', year: 2019, odometer: 42300, customerIndex: 1 },
    { vehicleNumber: 'MH14EF9012', vehicleType: 'BIKE', brand: 'Royal Enfield', model: 'Classic 350', year: 2022, odometer: 9100, customerIndex: 2 },
    { vehicleNumber: 'MH12GH3456', vehicleType: 'CAR', brand: 'Hyundai', model: 'i20 Sportz', year: 2020, odometer: 33800, customerIndex: 3 },
    { vehicleNumber: 'MH14IJ7890', vehicleType: 'BIKE', brand: 'Bajaj', model: 'Pulsar 150', year: 2018, odometer: 51200, customerIndex: 4 },
    { vehicleNumber: 'MH12KL2345', vehicleType: 'CAR', brand: 'Tata', model: 'Nexon XM', year: 2023, odometer: 12600, customerIndex: 5 },
    { vehicleNumber: 'MH12MN6789', vehicleType: 'BIKE', brand: 'TVS', model: 'Jupiter', year: 2020, odometer: 27400, customerIndex: 0 },
  ];

  const vehicles = [];
  for (const seed of vehicleSeeds) {
    const { customerIndex, ...rest } = seed;
    vehicles.push(
      await prisma.vehicle.create({
        data: { ...rest, customerId: customers[customerIndex].id, createdById: admin.id },
      }),
    );
  }

  /* --------------------------------------------------------- job cards */
  let jobSeq = 1;
  let invSeq = 1;
  const year = new Date().getFullYear();
  const jobNo = () => `JC-${year}-${String(jobSeq++).padStart(4, '0')}`;
  const invNo = () => `INV-${year}-${String(invSeq++).padStart(4, '0')}`;

  interface JobDef {
    vehicleIndex: number;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    complaint: string;
    workPerformed: string;
    createdAt: Date;
    parts: Array<{ partName: string; quantity: number; unitPrice: number }>;
    labour: Array<{ description: string; amount: number }>;
    service: Array<{ description: string; amount: number }>;
    invoice?: { paymentStatus: 'PAID' | 'UNPAID'; discount?: number; daysAgo: number };
  }

  const jobDefs: JobDef[] = [
    {
      vehicleIndex: 0,
      status: 'COMPLETED',
      complaint: 'Regular service and engine oil change. Slight starting trouble in the morning.',
      workPerformed: 'Full service done. Engine oil and oil filter replaced, spark plug cleaned, carburetor tuned.',
      createdAt: daysAgo(0),
      parts: [
        { partName: 'Engine Oil 10W-30 (0.8L)', quantity: 1, unitPrice: 420 },
        { partName: 'Oil Filter', quantity: 1, unitPrice: 180 },
        { partName: 'Spark Plug', quantity: 1, unitPrice: 160 },
      ],
      labour: [{ description: 'General service labour', amount: 350 }],
      service: [{ description: 'Bike wash & polish', amount: 150 }],
      invoice: { paymentStatus: 'PAID', daysAgo: 0 },
    },
    {
      vehicleIndex: 1,
      status: 'COMPLETED',
      complaint: 'Brakes making noise, AC not cooling well.',
      workPerformed: 'Front brake pads replaced, brake fluid topped up. AC gas refilled and cabin filter cleaned.',
      createdAt: daysAgo(2),
      parts: [
        { partName: 'Front Brake Pad Set', quantity: 1, unitPrice: 1450 },
        { partName: 'Brake Fluid DOT3', quantity: 1, unitPrice: 240 },
        { partName: 'AC Gas Refill (R134a)', quantity: 1, unitPrice: 1200 },
      ],
      labour: [
        { description: 'Brake pad replacement', amount: 500 },
        { description: 'AC service labour', amount: 600 },
      ],
      service: [{ description: 'Car wash', amount: 250 }],
      invoice: { paymentStatus: 'UNPAID', daysAgo: 2 },
    },
    {
      vehicleIndex: 2,
      status: 'COMPLETED',
      complaint: 'Chain loose and making noise. Clutch feels hard.',
      workPerformed: 'Chain lubricated and adjusted, clutch cable replaced and lever adjusted.',
      createdAt: daysAgo(5),
      parts: [
        { partName: 'Clutch Cable', quantity: 1, unitPrice: 320 },
        { partName: 'Chain Lube Spray', quantity: 1, unitPrice: 260 },
      ],
      labour: [{ description: 'Chain adjustment & clutch work', amount: 400 }],
      service: [],
      invoice: { paymentStatus: 'PAID', discount: 50, daysAgo: 5 },
    },
    {
      vehicleIndex: 3,
      status: 'IN_PROGRESS',
      complaint: 'Suspension noise from front left, steering vibration at high speed.',
      workPerformed: 'Wheel alignment and balancing in progress. Front strut being inspected.',
      createdAt: daysAgo(1),
      parts: [{ partName: 'Wheel Weights (set)', quantity: 1, unitPrice: 120 }],
      labour: [{ description: 'Wheel alignment & balancing', amount: 800 }],
      service: [],
    },
    {
      vehicleIndex: 4,
      status: 'PENDING',
      complaint: 'Headlight not working, battery weak - needs jump start every morning.',
      workPerformed: '',
      createdAt: daysAgo(0),
      parts: [],
      labour: [],
      service: [],
    },
    {
      vehicleIndex: 5,
      status: 'COMPLETED',
      complaint: 'First free service - general check-up.',
      workPerformed: 'First service completed. All fluids checked and topped, software update applied, general inspection done.',
      createdAt: daysAgo(9),
      parts: [{ partName: 'Coolant Top-up', quantity: 1, unitPrice: 300 }],
      labour: [{ description: 'First service labour (complimentary)', amount: 0 }],
      service: [{ description: 'Interior vacuum & wash', amount: 400 }],
      invoice: { paymentStatus: 'PAID', daysAgo: 9 },
    },
    {
      vehicleIndex: 6,
      status: 'IN_PROGRESS',
      complaint: 'Scooter pulling to one side, tyre worn out.',
      workPerformed: 'Rear tyre replacement in progress.',
      createdAt: daysAgo(1),
      parts: [{ partName: 'Rear Tyre 90/90-12', quantity: 1, unitPrice: 1150 }],
      labour: [{ description: 'Tyre replacement labour', amount: 150 }],
      service: [],
    },
  ];

  for (const def of jobDefs) {
    const vehicle = vehicles[def.vehicleIndex];
    const partsTotal = def.parts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
    const labourTotal = def.labour.reduce((s, l) => s + l.amount, 0);
    const serviceTotal = def.service.reduce((s, l) => s + l.amount, 0);

    const jobCard = await prisma.jobCard.create({
      data: {
        jobCardNumber: jobNo(),
        vehicleId: vehicle.id,
        customerId: vehicle.customerId,
        complaint: def.complaint,
        workPerformed: def.workPerformed,
        status: def.status,
        odometer: vehicle.odometer,
        completedAt: def.status === 'COMPLETED' ? def.createdAt : null,
        createdById: admin.id,
        createdAt: def.createdAt,
        parts: {
          create: def.parts.map((p, i) => ({
            partName: p.partName,
            quantity: D(p.quantity),
            unitPrice: D(p.unitPrice),
            total: D(p.quantity * p.unitPrice),
            sortOrder: i,
          })),
        },
        labourCharges: {
          create: def.labour.map((l, i) => ({ description: l.description, amount: D(l.amount), sortOrder: i })),
        },
        serviceCharges: {
          create: def.service.map((s, i) => ({ description: s.description, amount: D(s.amount), sortOrder: i })),
        },
      },
    });

    if (def.invoice) {
      const subtotal = partsTotal + labourTotal + serviceTotal;
      const discount = def.invoice.discount ?? 0;
      const taxable = subtotal - discount;
      const taxRate = 18;
      const tax = Math.round(((taxable * taxRate) / 100) * 100) / 100;
      const total = Math.round((taxable + tax) * 100) / 100;
      const createdAt = daysAgo(def.invoice.daysAgo);

      await prisma.invoice.create({
        data: {
          invoiceNumber: invNo(),
          publicToken: token(),
          jobCardId: jobCard.id,
          customerId: vehicle.customerId,
          subtotal: D(subtotal),
          taxRate: D(taxRate),
          tax: D(tax),
          discount: D(discount),
          totalAmount: D(total),
          paymentStatus: def.invoice.paymentStatus,
          paymentMethod: def.invoice.paymentStatus === 'PAID' ? 'Cash' : null,
          paidAt: def.invoice.paymentStatus === 'PAID' ? createdAt : null,
          createdById: admin.id,
          createdAt,
          items: {
            create: [
              ...def.parts.map((p, i) => ({
                kind: 'PART' as const,
                description: p.partName,
                quantity: D(p.quantity),
                unitPrice: D(p.unitPrice),
                total: D(p.quantity * p.unitPrice),
                sortOrder: i,
              })),
              ...def.labour.map((l, i) => ({
                kind: 'LABOUR' as const,
                description: l.description,
                quantity: D(1),
                unitPrice: D(l.amount),
                total: D(l.amount),
                sortOrder: 100 + i,
              })),
              ...def.service.map((s, i) => ({
                kind: 'SERVICE' as const,
                description: s.description,
                quantity: D(1),
                unitPrice: D(s.amount),
                total: D(s.amount),
                sortOrder: 200 + i,
              })),
            ],
          },
        },
      });
    }
  }

  // Advance the garage counters past the seeded documents.
  await prisma.garage.update({
    where: { id: 'garage' },
    data: { jobCardNextNumber: jobSeq, invoiceNextNumber: invSeq },
  });

  await summary();
}

async function summary() {
  const [customers, vehicles, jobCards, invoices] = await Promise.all([
    prisma.customer.count(),
    prisma.vehicle.count(),
    prisma.jobCard.count(),
    prisma.invoice.count(),
  ]);

  console.log('\nSeed complete:');
  console.log(`  Customers: ${customers}`);
  console.log(`  Vehicles:  ${vehicles}`);
  console.log(`  Job cards: ${jobCards}`);
  console.log(`  Invoices:  ${invoices}`);
  console.log('\nOwner login (the only account):');
  console.log(`  ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
