'use client';

import * as React from 'react';

/**
 * Shows the garage's brand logo from /public/logo.png.
 *
 * If that file is not present (or the uploaded `src` fails to load) it quietly
 * falls back to whatever `fallback` renders - so the app never shows a broken
 * image. Drop your logo at `public/logo.png` and it appears everywhere.
 */
export function BrandLogo({
  src = '/logo.png',
  alt = 'Logo',
  className,
  fallback,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
