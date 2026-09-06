/**
 * Tiny dependency-free CSV / TSV parser tuned for spreadsheet copy-paste.
 * Handles quoted fields, escaped quotes, and auto-detects comma vs tab so a
 * user can paste columns straight out of Excel or Google Sheets.
 */

export const IMPORT_FIELDS = [
  'customerName',
  'mobileNumber',
  'whatsappNumber',
  'address',
  'vehicleNumber',
  'vehicleType',
  'brand',
  'model',
  'year',
  'odometer',
  'lastServiceDate',
  'lastServiceNote',
  'lastServiceAmount',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Accepts many friendly header spellings and maps them to a canonical field. */
const HEADER_ALIASES: Record<string, ImportField> = {
  customername: 'customerName',
  customer: 'customerName',
  name: 'customerName',
  ownername: 'customerName',
  owner: 'customerName',

  mobilenumber: 'mobileNumber',
  mobile: 'mobileNumber',
  mobileno: 'mobileNumber',
  phone: 'mobileNumber',
  phonenumber: 'mobileNumber',
  contact: 'mobileNumber',
  contactnumber: 'mobileNumber',

  whatsappnumber: 'whatsappNumber',
  whatsapp: 'whatsappNumber',
  whatsappno: 'whatsappNumber',

  address: 'address',
  area: 'address',

  vehiclenumber: 'vehicleNumber',
  vehicleno: 'vehicleNumber',
  vehicle: 'vehicleNumber',
  number: 'vehicleNumber',
  regno: 'vehicleNumber',
  registrationnumber: 'vehicleNumber',
  registration: 'vehicleNumber',
  plate: 'vehicleNumber',
  platenumber: 'vehicleNumber',

  vehicletype: 'vehicleType',
  type: 'vehicleType',

  brand: 'brand',
  make: 'brand',
  company: 'brand',

  model: 'model',

  year: 'year',

  odometer: 'odometer',
  km: 'odometer',
  kms: 'odometer',
  kilometers: 'odometer',
  reading: 'odometer',

  lastservicedate: 'lastServiceDate',
  servicedate: 'lastServiceDate',
  date: 'lastServiceDate',
  lastservice: 'lastServiceDate',

  lastservicenote: 'lastServiceNote',
  servicenote: 'lastServiceNote',
  work: 'lastServiceNote',
  workdone: 'lastServiceNote',
  note: 'lastServiceNote',
  notes: 'lastServiceNote',
  description: 'lastServiceNote',
  remarks: 'lastServiceNote',

  lastserviceamount: 'lastServiceAmount',
  serviceamount: 'lastServiceAmount',
  amount: 'lastServiceAmount',
  bill: 'lastServiceAmount',
  billamount: 'lastServiceAmount',
  total: 'lastServiceAmount',
};

function normalizeHeader(raw: string): ImportField | null {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return HEADER_ALIASES[key] ?? null;
}

/** Split one delimited line respecting quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      out.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

export interface ParseResult {
  rows: Array<Record<ImportField, string>>;
  headers: ImportField[];
  unknownHeaders: string[];
  error?: string;
}

export function parseImportText(text: string): ParseResult {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!clean) return { rows: [], headers: [], unknownHeaders: [], error: 'Nothing to import yet.' };

  const lines = clean.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      headers: [],
      unknownHeaders: [],
      error: 'Add a header row plus at least one data row.',
    };
  }

  // Auto-detect delimiter from the header line: tab wins if present (Excel paste).
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : ',';

  const rawHeaders = splitLine(headerLine, delimiter);
  const headers: (ImportField | null)[] = rawHeaders.map(normalizeHeader);
  const unknownHeaders = rawHeaders.filter((_, i) => headers[i] === null);
  const knownHeaders = headers.filter((h): h is ImportField => h !== null);

  if (!knownHeaders.includes('customerName') || !knownHeaders.includes('vehicleNumber')) {
    return {
      rows: [],
      headers: knownHeaders,
      unknownHeaders,
      error:
        'The header row must include at least a customer name and a vehicle number column. Use the template to be safe.',
    };
  }

  const rows: Array<Record<ImportField, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter);
    const row = {} as Record<ImportField, string>;
    for (const field of IMPORT_FIELDS) row[field] = '';
    headers.forEach((field, idx) => {
      if (field) row[field] = cells[idx] ?? '';
    });
    // Ignore fully blank lines.
    if (Object.values(row).some((v) => v.trim() !== '')) rows.push(row);
  }

  return { rows, headers: knownHeaders, unknownHeaders };
}

/** A ready-to-use CSV template with two example rows. */
export function buildTemplateCsv(): string {
  const header = IMPORT_FIELDS.join(',');
  const example1 =
    'Ramesh Kumar,9876500001,9876500001,"Kothrud, Pune",MH12AB1234,BIKE,Honda,Activa 6G,2021,18400,2025-06-15,General service + oil change,850';
  const example2 =
    'Priya Sharma,9876500002,,"Baner, Pune",MH12CD5678,CAR,Maruti Suzuki,Swift VXi,2019,42300,,,';
  return `${header}\n${example1}\n${example2}\n`;
}
