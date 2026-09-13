'use client';

import * as React from 'react';

/**
 * Shows the first logo image in `src` that actually loads, falling back to
 * `fallback` when none do - so a missing file never renders as a broken image.
 *
 * Callers pass the uploaded garage logo first when present, then the built-in
 * brand mark (see BRAND_LOGO_SRC in @/lib/brand).
 */
export function BrandLogo({
  src,
  alt = 'Logo',
  className,
  fallback,
}: {
  src?: string | null | ReadonlyArray<string | null | undefined>;
  alt?: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const sources = React.useMemo(
    () => (Array.isArray(src) ? [...src] : [src]).filter(Boolean) as string[],
    [src],
  );
  const [index, setIndex] = React.useState(0);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  const chain = sources.join('|');
  React.useEffect(() => setIndex(0), [chain]);

  // A server-rendered image can fail before React attaches onError, so re-check
  // the loaded state on mount as well.
  React.useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setIndex((i) => i + 1);
  }, [index, chain]);

  const current = sources[index];
  if (!current) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={current}
      ref={imgRef}
      src={current}
      alt={alt}
      className={className}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
