import { prisma } from '@/lib/prisma';
import { ApiError, adminOnly, ok, withAuth } from '@/lib/api';
import { GARAGE_ID } from '@/lib/garage';
import { uploadFile } from '@/lib/storage';
import { serializeGarage } from '@/lib/serializers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export const POST = withAuth(async (req) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');

  if (!file || typeof file === 'string') {
    throw new ApiError(400, 'Choose an image file to upload.');
  }

  if (!ALLOWED.includes(file.type)) {
    throw new ApiError(400, 'Logo must be a PNG, JPG or WebP image.');
  }

  if (file.size > MAX_BYTES) {
    throw new ApiError(400, 'Logo must be smaller than 2MB.');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.type.split('/')[1].replace('jpeg', 'jpg');

  let url: string;
  try {
    const stored = await uploadFile(`branding/logo-${Date.now()}.${extension}`, bytes, file.type);
    url = stored.url;
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : 'Logo upload failed.');
  }

  const garage = await prisma.garage.upsert({
    where: { id: GARAGE_ID },
    create: { id: GARAGE_ID, logoUrl: url },
    update: { logoUrl: url },
  });

  return ok(serializeGarage(garage));
}, adminOnly);

export const DELETE = withAuth(async () => {
  const garage = await prisma.garage.upsert({
    where: { id: GARAGE_ID },
    create: { id: GARAGE_ID },
    update: { logoUrl: null },
  });
  return ok(serializeGarage(garage));
}, adminOnly);
