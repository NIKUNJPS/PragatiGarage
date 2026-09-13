import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Providers } from '@/app/providers';

export const metadata: Metadata = {
  title: {
    default: 'Pragati Auto - Garage Management Software',
    template: '%s · Pragati Auto',
  },
  description:
    'Pragati Auto (Raskar and Sons) garage management: customers, vehicles, job cards, invoices and one-click WhatsApp sharing, all in one place.',
  applicationName: 'Pragati Auto',
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
