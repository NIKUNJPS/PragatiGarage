import type { Garage } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export const GARAGE_ID = 'garage';

/** The garage profile is a single row; create it lazily on first read. */
export async function getGarage(): Promise<Garage> {
  const existing = await prisma.garage.findUnique({ where: { id: GARAGE_ID } });
  if (existing) return existing;
  return prisma.garage.upsert({
    where: { id: GARAGE_ID },
    create: { id: GARAGE_ID },
    update: {},
  });
}

/**
 * Expands date tokens in a numbering prefix so owners can get numbers like
 * JC-2026-0001 without editing settings every January.
 *   {YYYY} -> 2026   {YY} -> 26   {MM} -> 03
 */
export function expandPrefix(prefix: string, when = new Date()): string {
  const yyyy = String(when.getFullYear());
  return prefix
    .replace(/\{YYYY\}/gi, yyyy)
    .replace(/\{YY\}/gi, yyyy.slice(-2))
    .replace(/\{MM\}/gi, String(when.getMonth() + 1).padStart(2, '0'));
}

export function formatDocumentNumber(prefix: string, sequence: number, when = new Date()): string {
  return `${expandPrefix(prefix, when)}${String(sequence).padStart(4, '0')}`;
}

type Counter = 'jobCard' | 'invoice';

/**
 * Atomically reserve the next document number.
 *
 * The increment happens inside a single UPDATE ... SET n = n + 1 RETURNING n,
 * so two concurrent requests can never be handed the same sequence value even
 * without an explicit transaction.
 */
export async function nextDocumentNumber(counter: Counter): Promise<string> {
  const updated =
    counter === 'jobCard'
      ? await prisma.garage.upsert({
          where: { id: GARAGE_ID },
          create: { id: GARAGE_ID, jobCardNextNumber: 2 },
          update: { jobCardNextNumber: { increment: 1 } },
        })
      : await prisma.garage.upsert({
          where: { id: GARAGE_ID },
          create: { id: GARAGE_ID, invoiceNextNumber: 2 },
          update: { invoiceNextNumber: { increment: 1 } },
        });

  const prefix = counter === 'jobCard' ? updated.jobCardPrefix : updated.invoicePrefix;
  const nextValue = counter === 'jobCard' ? updated.jobCardNextNumber : updated.invoiceNextNumber;
  // `nextValue` is the value *after* the increment, so the number we just
  // reserved for this document is one less.
  return formatDocumentNumber(prefix, nextValue - 1);
}

/** Preview of the number the next document will get, without consuming it. */
export async function peekDocumentNumber(counter: Counter): Promise<string> {
  const garage = await getGarage();
  return counter === 'jobCard'
    ? formatDocumentNumber(garage.jobCardPrefix, garage.jobCardNextNumber)
    : formatDocumentNumber(garage.invoicePrefix, garage.invoiceNextNumber);
}

/** Shape handed to the client / PDF renderer. */
export function garagePublicProfile(garage: Garage) {
  return {
    name: garage.name,
    address: garage.address,
    phone: garage.phone,
    whatsappNumber: garage.whatsappNumber,
    gstNumber: garage.gstNumber,
    email: garage.email,
    logoUrl: garage.logoUrl,
    currency: garage.currency,
    invoiceTerms: garage.invoiceTerms,
  };
}
