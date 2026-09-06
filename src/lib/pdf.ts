import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';

import type { InvoiceView } from '@/lib/invoice-data';
import { KIND_LABELS } from '@/lib/invoice-data';
import { formatDate, round2 } from '@/lib/utils';

/* --------------------------------------------------------------------------
 * A4 invoice renderer built on pdf-lib.
 * The layout intentionally mirrors the on-screen invoice so the printed copy,
 * the browser print view and the downloaded PDF all look the same.
 * ----------------------------------------------------------------------- */

const A4 = { width: 595.28, height: 841.89 };
const M = 42; // page margin
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.46, 0.53);
const LINE = rgb(0.85, 0.87, 0.9);
const BAND = rgb(0.96, 0.97, 0.98);
const BRAND = rgb(0.05, 0.36, 0.72);
const GREEN = rgb(0.06, 0.5, 0.28);
const RED = rgb(0.72, 0.11, 0.15);

/**
 * The standard PDF fonts only cover WinAnsi, which has no rupee sign, so INR is
 * written as "Rs." Everything else uses its normal symbol.
 */
function pdfCurrency(value: number, currency: string): string {
  const symbols: Record<string, string> = {
    INR: 'Rs. ',
    USD: '$',
    EUR: 'EUR ',
    GBP: 'GBP ',
    AED: 'AED ',
    AUD: 'A$',
    CAD: 'C$',
  };
  const sym = symbols[currency] ?? `${currency} `;
  const n = round2(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${n}`;
}

/** pdf-lib throws on characters outside WinAnsi, so scrub anything exotic. */
function safe(text: string): string {
  return (text || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E\n]/g, '');
}

function textWidth(font: PDFFont, text: string, size: number) {
  return font.widthOfTextAtSize(safe(text), size);
}

/** Greedy word wrap that also hard-splits words longer than the column. */
function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of safe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(font, candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (textWidth(font, word, size) <= maxWidth) {
        line = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          if (textWidth(font, chunk + ch, size) > maxWidth) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
}

function draw(
  ctx: Ctx,
  text: string,
  x: number,
  size: number,
  opts: { bold?: boolean; color?: ReturnType<typeof rgb>; y?: number } = {},
) {
  ctx.page.drawText(safe(text), {
    x,
    y: opts.y ?? ctx.y,
    size,
    font: opts.bold ? ctx.bold : ctx.regular,
    color: opts.color ?? INK,
  });
}

function drawRight(
  ctx: Ctx,
  text: string,
  right: number,
  size: number,
  opts: { bold?: boolean; color?: ReturnType<typeof rgb>; y?: number } = {},
) {
  const font = opts.bold ? ctx.bold : ctx.regular;
  draw(ctx, text, right - textWidth(font, text, size), size, opts);
}

async function embedLogo(doc: PDFDocument, logoUrl: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    let bytes: Uint8Array;
    let isPng = logoUrl.includes('image/png') || /\.png($|\?)/i.test(logoUrl);

    if (logoUrl.startsWith('data:')) {
      const [meta, b64] = logoUrl.split(',');
      if (!b64) return null;
      isPng = meta.includes('image/png');
      bytes = Buffer.from(b64, 'base64');
    } else {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || '';
      if (type.includes('png')) isPng = true;
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    // A broken logo should never stop an invoice from being produced.
    return null;
  }
}

export async function renderInvoicePdf(invoice: InvoiceView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${invoice.invoiceNumber}`);
  doc.setSubject(`Invoice for ${invoice.vehicle.vehicleNumber}`);
  doc.setProducer('Garage Management System');
  doc.setCreator(invoice.garage.name);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, invoice.garage.logoUrl);

  const currency = invoice.garage.currency;
  const money = (v: number) => pdfCurrency(v, currency);
  const contentWidth = A4.width - M * 2;
  const right = A4.width - M;

  let page = doc.addPage([A4.width, A4.height]);
  const ctx: Ctx = { doc, page, regular, bold, y: A4.height - M };

  /* ---------------------------------------------------------------- header */
  let headerX = M;
  if (logo) {
    const box = 56;
    const scale = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.page.drawImage(logo, { x: M, y: ctx.y - h, width: w, height: h });
    headerX = M + w + 14;
  }

  ctx.y -= 16;
  draw(ctx, invoice.garage.name, headerX, 17, { bold: true });
  ctx.y -= 14;
  const infoLines = [
    invoice.garage.address,
    [invoice.garage.phone && `Phone: ${invoice.garage.phone}`, invoice.garage.email]
      .filter(Boolean)
      .join('   '),
    invoice.garage.gstNumber ? `GSTIN: ${invoice.garage.gstNumber}` : '',
  ].filter(Boolean) as string[];

  for (const info of infoLines) {
    for (const line of wrap(regular, info, 9, contentWidth - (headerX - M) - 150)) {
      draw(ctx, line, headerX, 9, { color: MUTED });
      ctx.y -= 11;
    }
  }

  // Invoice meta block, right aligned against the header.
  let metaY = A4.height - M - 14;
  drawRight(ctx, 'TAX INVOICE', right, 16, { bold: true, color: BRAND, y: metaY });
  metaY -= 16;
  drawRight(ctx, `No. ${invoice.invoiceNumber}`, right, 10, { bold: true, y: metaY });
  metaY -= 13;
  drawRight(ctx, `Date: ${formatDate(invoice.createdAt)}`, right, 9, { color: MUTED, y: metaY });
  metaY -= 12;
  drawRight(ctx, `Job Card: ${invoice.jobCard.jobCardNumber}`, right, 9, {
    color: MUTED,
    y: metaY,
  });

  // Payment status pill
  metaY -= 20;
  const paid = invoice.paymentStatus === 'PAID';
  const pillText = paid ? 'PAID' : 'PAYMENT DUE';
  const pillW = textWidth(bold, pillText, 9) + 18;
  ctx.page.drawRectangle({
    x: right - pillW,
    y: metaY - 4,
    width: pillW,
    height: 17,
    color: paid ? rgb(0.9, 0.97, 0.92) : rgb(0.99, 0.92, 0.92),
    borderColor: paid ? GREEN : RED,
    borderWidth: 0.8,
  });
  drawRight(ctx, pillText, right - 9, 9, { bold: true, color: paid ? GREEN : RED, y: metaY });

  ctx.y = Math.min(ctx.y, metaY) - 24;

  ctx.page.drawLine({
    start: { x: M, y: ctx.y },
    end: { x: right, y: ctx.y },
    thickness: 1,
    color: LINE,
  });
  ctx.y -= 22;

  /* -------------------------------------------------- bill-to / vehicle box */
  const colW = contentWidth / 2 - 8;
  const boxTop = ctx.y;

  draw(ctx, 'BILL TO', M, 8, { bold: true, color: MUTED });
  draw(ctx, 'VEHICLE', M + colW + 16, 8, { bold: true, color: MUTED });
  ctx.y -= 14;

  const customerLines = [
    invoice.customer.name,
    `Mobile: ${invoice.customer.mobileNumber}`,
    invoice.customer.address || '',
  ].filter(Boolean);

  const vehicleLines = [
    invoice.vehicle.vehicleNumber,
    [invoice.vehicle.brand, invoice.vehicle.model].filter(Boolean).join(' ') ||
      (invoice.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike'),
    `Type: ${invoice.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike'}`,
    invoice.vehicle.odometer ? `Odometer: ${invoice.vehicle.odometer} km` : '',
  ].filter(Boolean);

  const leftWrapped = customerLines.flatMap((l, i) => wrap(regular, l, i === 0 ? 11 : 9, colW));
  const rightWrapped = vehicleLines.flatMap((l, i) => wrap(regular, l, i === 0 ? 11 : 9, colW));
  const rows = Math.max(leftWrapped.length, rightWrapped.length);

  for (let i = 0; i < rows; i++) {
    const rowY = boxTop - 14 - i * 12;
    if (leftWrapped[i] !== undefined)
      draw(ctx, leftWrapped[i], M, i === 0 ? 11 : 9, {
        bold: i === 0,
        color: i === 0 ? INK : MUTED,
        y: rowY,
      });
    if (rightWrapped[i] !== undefined)
      draw(ctx, rightWrapped[i], M + colW + 16, i === 0 ? 11 : 9, {
        bold: i === 0,
        color: i === 0 ? INK : MUTED,
        y: rowY,
      });
  }
  ctx.y = boxTop - 14 - rows * 12 - 16;

  /* ----------------------------------------------------------- items table */
  const cols = {
    sn: M + 6,
    desc: M + 30,
    type: M + 292,
    qty: M + 372,
    rate: M + 440,
    amount: right - 6,
  };
  const descWidth = cols.type - cols.desc - 10;

  const drawTableHeader = () => {
    ctx.page.drawRectangle({
      x: M,
      y: ctx.y - 6,
      width: contentWidth,
      height: 22,
      color: BAND,
    });
    draw(ctx, '#', cols.sn, 8.5, { bold: true, color: MUTED });
    draw(ctx, 'DESCRIPTION', cols.desc, 8.5, { bold: true, color: MUTED });
    draw(ctx, 'TYPE', cols.type, 8.5, { bold: true, color: MUTED });
    drawRight(ctx, 'QTY', cols.qty + 26, 8.5, { bold: true, color: MUTED });
    drawRight(ctx, 'RATE', cols.rate + 50, 8.5, { bold: true, color: MUTED });
    drawRight(ctx, 'AMOUNT', cols.amount, 8.5, { bold: true, color: MUTED });
    ctx.y -= 24;
  };

  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    ctx.page = page;
    ctx.y = A4.height - M;
    draw(ctx, `Invoice ${invoice.invoiceNumber} (continued)`, M, 9, { color: MUTED });
    ctx.y -= 20;
    drawTableHeader();
  };

  drawTableHeader();

  invoice.items.forEach((item, index) => {
    const lines = wrap(regular, item.description, 9.5, descWidth);
    const rowHeight = Math.max(18, lines.length * 12 + 6);

    if (ctx.y - rowHeight < 190) newPage();

    if (index % 2 === 1) {
      ctx.page.drawRectangle({
        x: M,
        y: ctx.y - rowHeight + 12,
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.985, 0.99, 0.995),
      });
    }

    draw(ctx, String(index + 1), cols.sn, 9.5, { color: MUTED });
    lines.forEach((line, i) => {
      draw(ctx, line, cols.desc, 9.5, { y: ctx.y - i * 12 });
    });
    draw(ctx, KIND_LABELS[item.kind], cols.type, 9, { color: MUTED });
    drawRight(ctx, String(item.quantity), cols.qty + 26, 9.5);
    drawRight(ctx, money(item.unitPrice), cols.rate + 50, 9.5);
    drawRight(ctx, money(item.total), cols.amount, 9.5, { bold: true });

    ctx.y -= rowHeight;
    ctx.page.drawLine({
      start: { x: M, y: ctx.y + 10 },
      end: { x: right, y: ctx.y + 10 },
      thickness: 0.5,
      color: LINE,
    });
  });

  /* --------------------------------------------------------------- totals */
  if (ctx.y < 210) newPage();
  ctx.y -= 12;

  const totalsLeft = right - 220;
  const totalRow = (label: string, value: string, opts: { bold?: boolean; color?: any } = {}) => {
    draw(ctx, label, totalsLeft, opts.bold ? 10.5 : 9.5, {
      bold: opts.bold,
      color: opts.color ?? MUTED,
    });
    drawRight(ctx, value, right, opts.bold ? 10.5 : 9.5, { bold: true, color: opts.color ?? INK });
    ctx.y -= opts.bold ? 18 : 15;
  };

  totalRow('Subtotal', money(invoice.subtotal));
  if (invoice.discount > 0) totalRow('Discount', `- ${money(invoice.discount)}`);
  if (invoice.taxRate > 0 || invoice.tax > 0)
    totalRow(`Tax / GST (${invoice.taxRate}%)`, money(invoice.tax));

  ctx.page.drawLine({
    start: { x: totalsLeft, y: ctx.y + 8 },
    end: { x: right, y: ctx.y + 8 },
    thickness: 0.8,
    color: LINE,
  });
  ctx.y -= 8;

  ctx.page.drawRectangle({
    x: totalsLeft - 12,
    y: ctx.y - 8,
    width: right - totalsLeft + 12,
    height: 26,
    color: BAND,
  });
  ctx.y -= 1;
  totalRow('GRAND TOTAL', money(invoice.totalAmount), { bold: true, color: INK });

  if (invoice.paymentStatus === 'PAID' && invoice.paidAt) {
    ctx.y -= 4;
    drawRight(
      ctx,
      `Paid on ${formatDate(invoice.paidAt)}${invoice.paymentMethod ? ` (${invoice.paymentMethod})` : ''}`,
      right,
      8.5,
      { color: GREEN },
    );
    ctx.y -= 14;
  }

  /* ------------------------------------------------- complaint / work done */
  ctx.y -= 12;
  const notesBlocks: Array<[string, string]> = [];
  if (invoice.jobCard.complaint) notesBlocks.push(['Customer complaint', invoice.jobCard.complaint]);
  if (invoice.jobCard.workPerformed)
    notesBlocks.push(['Work performed', invoice.jobCard.workPerformed]);
  if (invoice.notes) notesBlocks.push(['Notes', invoice.notes]);

  for (const [label, body] of notesBlocks) {
    const lines = wrap(regular, body, 8.5, contentWidth);
    if (ctx.y - (lines.length * 11 + 20) < 90) newPage();
    draw(ctx, label.toUpperCase(), M, 8, { bold: true, color: MUTED });
    ctx.y -= 12;
    for (const line of lines) {
      draw(ctx, line, M, 8.5, { color: INK });
      ctx.y -= 11;
    }
    ctx.y -= 8;
  }

  /* --------------------------------------------------------------- footer */
  const footerY = 58;
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: footerY + 26 },
      end: { x: right, y: footerY + 26 },
      thickness: 0.5,
      color: LINE,
    });
    const terms = wrap(regular, invoice.garage.invoiceTerms, 7.5, contentWidth - 90);
    terms.slice(0, 2).forEach((line, li) => {
      p.drawText(safe(line), {
        x: M,
        y: footerY + 12 - li * 9,
        size: 7.5,
        font: regular,
        color: MUTED,
      });
    });
    const pageLabel = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pageLabel, {
      x: right - regular.widthOfTextAtSize(pageLabel, 7.5),
      y: footerY + 12,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  });

  return doc.save();
}
