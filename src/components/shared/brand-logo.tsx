'use client';

import * as React from 'react';

/**
 * Shows a logo image from `src`, falling back to `fallback` only if it is
 * missing or fails to load - so a missing file never renders as a broken image.
 *
 * Callers pass the uploaded garage logo when present, otherwise the built-in
 * brand mark at /public/logo.svg (which always exists).
 */
export function BrandLogo({
  src,
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

  React.useEffect(() => setFailed(false), [src]);

  if (!src || failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={src} src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  );
}
