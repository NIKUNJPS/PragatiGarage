'use client';

import * as React from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { cn, initials } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import type { GarageDTO } from '@/types';

/**
 * Uploads via multipart/form-data to /api/garage/logo. Works with or without
 * Supabase Storage - the server falls back to an inline data URL when no bucket
 * is configured, so this is functional out of the box.
 */
export function LogoUploader({
  garage,
  onChange,
  garageName,
}: {
  garage: GarageDTO;
  onChange: (garage: GarageDTO) => void;
  garageName: string;
}) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/garage/logo', { method: 'POST', body: form });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Upload failed.');
      onChange(payload as GarageDTO);
      toast.success('Logo updated');
    } catch (error) {
      toast.error('Could not upload logo', errorMessage(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const updated = await api.del<GarageDTO>('/api/garage/logo');
      onChange(updated);
      toast.success('Logo removed');
    } catch (error) {
      toast.error('Could not remove logo', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          'flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted',
        )}
      >
        {garage.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={garage.logoUrl} alt="Garage logo" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xl font-bold text-muted-foreground">
            {initials(garageName) || 'GM'}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {garage.logoUrl ? 'Change logo' : 'Upload logo'}
          </Button>
          {garage.logoUrl && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="text-destructive" /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG or WebP, up to 2MB. Appears on invoices and job cards.
        </p>
      </div>
    </div>
  );
}
