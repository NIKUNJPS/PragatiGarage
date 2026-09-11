import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Providers } from '@/app/providers';

export const metadata: Metadata = {
  title: {
    default: 'WrenchBook - Garage Management Software',
    template: '%s · WrenchBook',
  },
  description:
    'WrenchBook is garage management software for bike and car workshops: customers, vehicles, job cards, invoices and one-click WhatsApp sharing, all in one place.',
  applicationName: 'WrenchBook',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0f4fb8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
