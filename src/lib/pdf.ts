import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';

import type { InvoiceView } from '@/lib/invoice-data';
import { formatDate, round2 } from '@/lib/utils';

/* --------------------------------------------------------------------------
 * A4 invoice PDF built to mirror the Pragati Auto bill book: centred logo +
 * tagline + phone, a customer/vehicle info box, a black-header
 * Sr.No / Particulars / Amount table, a TOTAL AMOUNT bar, and a
 * Thank You / Authorised Sign footer, with red/black corner accents.
 * pdf-lib + the standard Helvetica fonts (no external font files needed).
 * ----------------------------------------------------------------------- */

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.46, 0.53);
const LINE = rgb(0.8, 0.83, 0.86);
const RED = rgb(0.86, 0.15, 0.15);
const BLACK = rgb(0.05, 0.07, 0.11);
const GREEN = rgb(0.06, 0.5, 0.28);
const WHITE = rgb(1, 1, 1);

/** Standard PDF fonts have no rupee glyph, so INR is written "Rs." */
function money(value: number, currency: string): string {
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
  const n = round2(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${n}`;
}

/** Scrub characters outside WinAnsi (pdf-lib throws on them). */
function safe(text: string): string {
  return (text || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E\n]/g, '');
}

function width(font: PDFFont, text: string, size: number) {
  return font.widthOfTextAtSize(safe(text), size);
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of safe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(font, candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

async function embedLogo(doc: PDFDocument, logoUrl: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    let bytes: Uint8Array;
    let isPng = /image\/png/.test(logoUrl) || /\.png($|\?)/i.test(logoUrl);
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
      if (type.includes('svg')) return null; // pdf-lib can't embed SVG
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(invoice: InvoiceView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${invoice.invoiceNumber}`);
  doc.setProducer('Garage Management System');
  doc.setCreator(invoice.garage.name);

  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldOblique = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const logo = await embedLogo(doc, invoice.garage.logoUrl);

  const g = invoice.garage;
  const cur = g.currency;
  let page: PDFPage = doc.addPage([A4.width, A4.height]);
  const W = A4.width;
  const H = A4.height;
  const right = W - M;
  const centerX = W / 2;

  const text = (
    t: string,
    x: number,
    y: number,
    size: number,
    opts: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => page.drawText(safe(t), { x, y, size, font: opts.font ?? reg, color: opts.color ?? INK });

  const center = (
    t: string,
    y: number,
    size: number,
    opts: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => text(t, centerX - width(opts.font ?? reg, t, size) / 2, y, size, opts);

  const rightText = (
    t: string,
    x: number,
    y: number,
    size: number,
    opts: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => text(t, x - width(opts.font ?? reg, t, size), y, size, opts);

  /* ------------------------------------------------------------- corners */
  const corner = (cx: number, cy: number, sx: number, sy: number) => {
    // big black triangle + smaller red triangle
    page.drawSvgPath(`M0 0 L${52 * sx} 0 L0 ${52 * sy} Z`, { x: cx, y: cy, color: BLACK });
    page.drawSvgPath(`M0 0 L${32 * sx} 0 L0 ${32 * sy} Z`, { x: cx, y: cy, color: RED });
  };
  corner(0, H, 1, 1); // top-left (y down in svg path)
  corner(W, H, -1, 1); // top-right
  corner(0, 0, 1, -1); // bottom-left
  corner(W, 0, -1, -1); // bottom-right

  let y = H - M - 6;

  /* -------------------------------------------------------------- header */
  if (logo) {
    const box = 74;
    const scale = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: centerX - w / 2, y: y - h, width: w, height: h });
    y -= h + 6;
  } else {
    y -= 6;
  }

  center(g.name.toUpperCase(), y - 18, 20, { font: bold });
  y -= 26;

  if (g.tagline) {
    const size = 9;
    const tw = width(boldOblique, g.tagline.toUpperCase(), size);
    center(g.tagline.toUpperCase(), y - 8, size, { font: boldOblique });
    const lineY = y - 5;
    page.drawLine({ start: { x: centerX - tw / 2 - 30, y: lineY }, end: { x: centerX - tw / 2 - 8, y: lineY }, thickness: 1.2, color: RED });
    page.drawLine({ start: { x: centerX + tw / 2 + 8, y: lineY }, end: { x: centerX + tw / 2 + 30, y: lineY }, thickness: 1.2, color: RED });
    y -= 16;
  }

  if (g.phone) {
    center(g.phone, y - 12, 13, { font: bold });
    y -= 18;
  }

  const meta = [g.address, g.gstNumber && `GSTIN: ${g.gstNumber}`].filter(Boolean).join('   ');
  if (meta) {
    for (const line of wrap(reg, meta, 8, W - 2 * M - 20)) {
      center(line, y - 8, 8, { color: MUTED });
      y -= 10;
    }
  }

  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.8, color: LINE });
  y -= 4;

  // invoice no + status
  text(`Invoice: ${invoice.invoiceNumber}`, M, y - 11, 9, { font: bold });
  const paid = invoice.paymentStatus === 'PAID';
  const pill = paid ? 'PAID' : 'PAYMENT DUE';
  const pw = width(bold, pill, 8) + 14;
  page.drawRectangle({ x: right - pw, y: y - 13, width: pw, height: 15, color: paid ? GREEN : RED });
  rightText(pill, right - 7, y - 10, 8, { font: bold, color: WHITE });
  y -= 24;

  /* ------------------------------------------------ customer/vehicle box */
  const boxTop = y;
  const rowH = 18;
  const boxH = rowH * 3 + 12;
  page.drawRectangle({ x: M, y: boxTop - boxH, width: W - 2 * M, height: boxH, borderColor: BLACK, borderWidth: 1.4 });

  const colL = M + 12;
  const colR = centerX + 10;
  const field = (label: string, value: string, x: number, ry: number, mono = false) => {
    text(`${label} :`, x, ry, 9, { font: bold });
    const lx = x + width(bold, `${label} :`, 9) + 6;
    text(value || '-', lx, ry, 9, { font: mono ? bold : reg });
  };

  let ry = boxTop - 16;
  field('Customer Name', invoice.customer.name, colL, ry);
  field('Vehicle No.', invoice.vehicle.vehicleNumber, colR, ry, true);
  ry -= rowH;
  const makeModel =
    [invoice.vehicle.brand, invoice.vehicle.model].filter(Boolean).join(' ') ||
    (invoice.vehicle.vehicleType === 'CAR' ? 'Car' : 'Bike');
  field('Model', makeModel, colL, ry);
  field('K.M.', invoice.vehicle.odometer ? `${invoice.vehicle.odometer} km` : '-', colR, ry);
  ry -= rowH;
  field('Contact No.', invoice.customer.mobileNumber, colL, ry);
  field('Date', formatDate(invoice.createdAt), colR, ry);

  y = boxTop - boxH - 16;

  /* --------------------------------------------------------------- table */
  const cols = { sn: M, snW: 48, amtW: 110 };
  const partsX = M + cols.snW;
  const amtX = right - cols.amtW;
  const tableW = W - 2 * M;

  const drawHeader = () => {
    page.drawRectangle({ x: M, y: y - 20, width: tableW, height: 20, color: BLACK });
    text('Sr. No.', M + 6, y - 14, 9, { font: bold, color: WHITE });
    text('Particulars', partsX + 8, y - 14, 9, { font: bold, color: WHITE });
    rightText('Amount (Rs.)', right - 6, y - 14, 9, { font: bold, color: WHITE });
    // vertical separators
    page.drawLine({ start: { x: partsX, y: y }, end: { x: partsX, y: y - 20 }, thickness: 1, color: WHITE });
    page.drawLine({ start: { x: amtX, y: y }, end: { x: amtX, y: y - 20 }, thickness: 1, color: WHITE });
    y -= 20;
  };

  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
  };

  drawHeader();

  const partWidth = amtX - partsX - 16;
  const drawRow = (sn: string, particulars: string, amount: string | null, index: number) => {
    const lines = particulars ? wrap(reg, particulars, 9, partWidth) : [''];
    const h = Math.max(rowH, lines.length * 11 + 7);
    if (index % 2 === 1) {
      page.drawRectangle({ x: M, y: y - h, width: tableW, height: h, color: rgb(0.97, 0.98, 0.99) });
    }
    // borders
    page.drawRectangle({ x: M, y: y - h, width: tableW, height: h, borderColor: LINE, borderWidth: 0.7 });
    page.drawLine({ start: { x: partsX, y }, end: { x: partsX, y: y - h }, thickness: 0.7, color: LINE });
    page.drawLine({ start: { x: amtX, y }, end: { x: amtX, y: y - h }, thickness: 0.7, color: LINE });

    text(sn, M + 10, y - 13, 9, { color: MUTED });
    lines.forEach((l, i) => text(l, partsX + 8, y - 13 - i * 11, 9, { font: reg }));
    if (amount !== null) rightText(amount, right - 6, y - 13, 9, { font: bold });
    y -= h;
  };

  invoice.items.forEach((item, i) => {
    if (y < 210) {
      newPage();
      y = H - M - 20;
      drawHeader();
    }
    const p =
      item.quantity && item.quantity !== 1
        ? `${item.description}  (${item.quantity} x ${money(item.unitPrice, cur)})`
        : item.description;
    drawRow(`${i + 1}.`, p, money(item.total, cur), i);
  });
  // pad to a few rows
  for (let i = invoice.items.length; i < 4; i++) {
    drawRow(`${i + 1}.`, '', null, i);
  }

  /* -------------------------------------------------------------- totals */
  y -= 12;
  const tl = right - 210;
  const totalRow = (label: string, value: string) => {
    text(label, tl, y - 9, 9, { color: MUTED });
    rightText(value, right, y - 9, 9, { font: bold });
    y -= 14;
  };
  totalRow('Subtotal', money(invoice.subtotal, cur));
  if (invoice.discount > 0) totalRow('Discount', `- ${money(invoice.discount, cur)}`);
  if (invoice.taxRate > 0 || invoice.tax > 0) totalRow(`GST (${invoice.taxRate}%)`, money(invoice.tax, cur));

  y -= 2;
  // TOTAL AMOUNT bar
  const barH = 26;
  const barY = y - barH;
  const labelW = 150;
  page.drawRectangle({ x: tl - 20, y: barY, width: right - (tl - 20), height: barH, borderColor: BLACK, borderWidth: 1.4 });
  page.drawRectangle({ x: tl - 20, y: barY, width: labelW, height: barH, color: BLACK });
  text('TOTAL AMOUNT', tl - 12, barY + 9, 11, { font: bold, color: WHITE });
  rightText(money(invoice.totalAmount, cur), right - 8, barY + 8, 12, { font: bold });
  y = barY - 8;

  if (paid && invoice.paidAt) {
    rightText(
      `Paid on ${formatDate(invoice.paidAt)}${invoice.paymentMethod ? ` (${invoice.paymentMethod})` : ''}`,
      right,
      y - 8,
      8,
      { color: GREEN },
    );
    y -= 14;
  }

  /* --------------------------------------------------- complaint / notes */
  const notes: string[] = [];
  if (invoice.jobCard.complaint) notes.push(`Complaint: ${invoice.jobCard.complaint}`);
  if (invoice.notes) notes.push(`Note: ${invoice.notes}`);
  if (notes.length) {
    y -= 6;
    for (const n of notes) {
      for (const line of wrap(reg, n, 8, W - 2 * M)) {
        text(line, M, y - 8, 8, { color: MUTED });
        y -= 10;
      }
    }
  }

  /* -------------------------------------------------------------- footer */
  const footY = 70;
  text('Thank You!', M, footY + 6, 20, { font: boldOblique });
  page.drawLine({ start: { x: M, y: footY - 2 }, end: { x: M + 24, y: footY - 2 }, thickness: 2, color: RED });
  text('VISIT AGAIN', M + 30, footY - 6, 11, { font: bold });

  page.drawLine({ start: { x: right - 150, y: footY + 2 }, end: { x: right, y: footY + 2 }, thickness: 0.8, color: LINE });
  rightText('AUTHORISED SIGN', right, footY - 10, 9, { font: bold, color: MUTED });

  // terms line at very bottom
  const terms = wrap(reg, invoice.garage.invoiceTerms, 7, W - 2 * M)[0] || '';
  center(terms, 34, 7, { color: MUTED });

  return doc.save();
}
