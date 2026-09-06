import { createClient } from '@supabase/supabase-js';

import { supabaseConfig } from '@/lib/env';

export interface StoredFile {
  url: string;
  /** 'supabase' when uploaded to a bucket, 'inline' when embedded as a data URL. */
  driver: 'supabase' | 'inline';
}

const MAX_INLINE_BYTES = 400 * 1024; // ~400KB keeps the Garage row comfortably small

function supabase() {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  return {
    client: createClient(cfg.url, cfg.key, { auth: { persistSession: false } }),
    bucket: cfg.bucket,
  };
}

export function storageDriver(): 'supabase' | 'inline' {
  return supabaseConfig() ? 'supabase' : 'inline';
}

/**
 * Upload a file and return a publicly reachable URL.
 *
 * With Supabase configured the file goes to a public bucket. Without it, small
 * files (logos) fall back to an inline data URL so the app is fully usable with
 * zero external services — which is the default for a small garage.
 */
export async function uploadFile(
  path: string,
  data: Buffer | Uint8Array,
  contentType: string,
): Promise<StoredFile> {
  const sb = supabase();

  if (sb) {
    const { error } = await sb.client.storage
      .from(sb.bucket)
      .upload(path, data, { contentType, upsert: true, cacheControl: '3600' });

    if (error) {
      // A missing bucket is the most common misconfiguration - say so plainly.
      throw new Error(
        `Upload to Supabase Storage failed: ${error.message}. Make sure a public bucket named "${sb.bucket}" exists.`,
      );
    }

    const { data: pub } = sb.client.storage.from(sb.bucket).getPublicUrl(path);
    return { url: pub.publicUrl, driver: 'supabase' };
  }

  if (data.byteLength > MAX_INLINE_BYTES) {
    throw new Error(
      'File is too large for inline storage (max 400KB). Configure Supabase Storage in .env, or upload a smaller image.',
    );
  }

  const base64 = Buffer.from(data).toString('base64');
  return { url: `data:${contentType};base64,${base64}`, driver: 'inline' };
}

/** Best-effort delete; never throws, because a stale file is not worth an error page. */
export async function deleteFile(path: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  try {
    await sb.client.storage.from(sb.bucket).remove([path]);
  } catch (error) {
    console.warn('[storage] delete failed (ignored):', error);
  }
}

/** Upload a generated invoice PDF. Returns null when no bucket is configured. */
export async function uploadInvoicePdf(
  invoiceNumber: string,
  pdf: Uint8Array,
): Promise<string | null> {
  if (!supabaseConfig()) return null;
  const safe = invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_');
  const stored = await uploadFile(`invoices/${safe}.pdf`, pdf, 'application/pdf');
  return stored.url;
}
