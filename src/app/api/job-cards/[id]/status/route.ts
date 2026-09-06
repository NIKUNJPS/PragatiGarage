import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError, ok, parseBody, withAuth } from '@/lib/api';
import { serializeJobCardListItem } from '@/lib/serializers';
import { jobStatusSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const include = {
  customer: { select: { id: true, name: true, mobileNumber: true } },
  vehicle: { select: { id: true, vehicleNumber: true, vehicleType: true, brand: true, model: true } },
  parts: true,
  labourCharges: true,
  serviceCharges: true,
  invoice: { select: { id: true, invoiceNumber: true, paymentStatus: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.JobCardInclude;

/**
 * Status-only update so the list view can move a job along without opening it.
 * Returns `promptInvoice` so the UI knows when to offer invoice creation.
 */
export const PATCH = withAuth(async (req, { params }) => {
  const { status } = await parseBody(req, jobStatusSchema);

  const existing = await prisma.jobCard.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, isArchived: true, invoice: { select: { id: true } } },
  });
  if (!existing) throw new ApiError(404, 'That job card no longer exists.');
  if (existing.isArchived) throw new ApiError(400, 'Restore this job card before changing status.');

  const jobCard = await prisma.jobCard.update({
    where: { id: params.id },
    data: {
      status,
      completedAt:
        status === 'COMPLETED' ? (existing.status === 'COMPLETED' ? undefined : new Date()) : null,
    },
    include,
  });

  return ok({
    ...serializeJobCardListItem(jobCard),
    promptInvoice: status === 'COMPLETED' && !existing.invoice,
  });
});
