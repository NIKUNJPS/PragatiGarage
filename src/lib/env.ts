/**
 * Central place for reading environment configuration.
 * Values are read lazily so that a missing optional variable never breaks a build.
 */

function required(name: string, value: string | undefined, fallback?: string): string {
  if (value && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(
    `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
  );
}

export const AUTH_SECRET = () =>
  required(
    'AUTH_SECRET',
    process.env.AUTH_SECRET,
    process.env.NODE_ENV === 'production'
      ? undefined
      : 'dev-only-insecure-secret-change-me-please-32chars',
  );

/** Public origin of the app, used to build shareable invoice links. */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export const supabaseConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'garage';
  if (!url || !key) return null;
  return { url, key, bucket };
};

export const emailConfig = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: process.env.EMAIL_FROM || 'Garage Management <onboarding@resend.dev>' };
};

export const whatsappCloudConfig = () => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
};

export const isProd = () => process.env.NODE_ENV === 'production';
