/**
 * Brand identity for the app shell, public pages and documents.
 * The garage profile in Settings still overrides the name/logo on invoices.
 */
export const BRAND_NAME = 'Pragati Auto';
export const BRAND_SUBTITLE = 'Raskar and Sons';
export const BRAND_FULL_NAME = `${BRAND_NAME} — ${BRAND_SUBTITLE}`;

/**
 * Built-in logo sources, tried in order. Save the original artwork as
 * `public/logo.png` and it is used everywhere; the bundled SVG mark is the
 * fallback when that file is not there.
 */
export const BRAND_LOGO_SRC = ['/logo.png', '/logo.svg'] as const;
