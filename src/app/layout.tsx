import type { Metadata, Viewport } from 'next';

import './globals.css';
import { Providers } from '@/app/providers';

export const metadata: Metadata = {
  title: {
    default: 'Garage Management System',
    template: '%s · Garage Management',
  },
  description:
    'Customers, vehicles, job cards, invoices and WhatsApp sharing for bike and car garages.',
  applicationName: 'Garage Management System',
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
