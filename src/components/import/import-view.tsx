'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';

import { api, errorMessage } from '@/lib/client-api';
import { buildTemplateCsv, parseImportText, type ImportField } from '@/lib/csv';
import { cn, formatCurrency } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';

interface RowResult {
  row: number;
  status: 'created' | 'skipped' | 'error';
  message: string;
  customer?: string;
  vehicle?: string;
}
interface ImportResponse {
  summary: { total: number; created: number; skipped: number; failed: number; servicesAdded: number };
  results: RowResult[];
}

const PREVIEW_COLUMNS: Array<{ field: ImportField; label: string }> = [
  { field: 'customerName', label: 'Customer' },
  { field: 'mobileNumber', label: 'Mobile' },
  { field: 'vehicleNumber', label: 'Vehicle No.' },
  { field: 'vehicleType', label: 'Type' },
  { field: 'brand', label: 'Brand' },
  { field: 'model', label: 'Model' },
  { field: 'lastServiceDate', label: 'Service date' },
  { field: 'lastServiceAmount', label: 'Amount' },
];

export function ImportView() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { garage } = useSession();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState<ImportResponse | null>(null);

  const parsed = React.useMemo(() => (text.trim() ? parseImportText(text) : null), [text]);

  const validCount =
    parsed?.rows.filter(
      (r) => r.customerName.trim() && r.mobileNumber.replace(/\D/g, '').length >= 10 && r.vehicleNumber.trim(),
    ).length ?? 0;

  const importMutation = useMutation({
    mutationFn: (rows: Array<Record<string, string>>) =>
      api.post<ImportResponse>('/api/import', { rows, markServicesPaid: true }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(
        'Import finished',
        `${data.summary.created} added, ${data.summary.skipped} skipped, ${data.summary.failed} errors.`,
      );
    },
    onError: (error) => toast.error('Import failed', errorMessage(error)),
  });

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'garage-import-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    const content = await file.text();
    setText(content);
    setResult(null);
  };

  const startOver = () => {
    setText('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div>
      <PageHeader
        title="Import past data"
        description="Bring your existing customers and vehicles (and their past service) into the system in one go."
      />

      {/* --------------------------------------------------------- how it works */}
      <Card className="mb-4 border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4">
          <ol className="grid gap-3 sm:grid-cols-3">
            <Step n={1} title="Download the template">
              Open it in Excel or Google Sheets and fill one row per vehicle.
            </Step>
            <Step n={2} title="Upload or paste">
              Save as CSV and upload it, or copy your columns and paste them below.
            </Step>
            <Step n={3} title="Review &amp; import">
              Check the preview, then import. Duplicates are skipped automatically.
            </Step>
          </ol>
        </CardContent>
      </Card>

      {result ? (
        <ResultPanel result={result} currency={garage.currency} onDone={startOver} />
      ) : (
        <>
          {/* ------------------------------------------------------- step 1 */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">1. Get the template</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Only <span className="font-medium text-foreground">Customer name</span>,{' '}
                <span className="font-medium text-foreground">Mobile</span> and{' '}
                <span className="font-medium text-foreground">Vehicle number</span> are required. Fill
                the last-service columns only if you want old bills &amp; history added too.
              </p>
              <Button variant="outline" onClick={downloadTemplate} className="shrink-0">
                <Download /> Download template (CSV)
              </Button>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------- step 2 */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">2. Add your data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                  }}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload /> Upload CSV file
                </Button>
                <span className="text-sm text-muted-foreground">or paste from Excel below</span>
              </div>

              <Textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setResult(null);
                }}
                rows={6}
                placeholder={
                  'Paste rows here, e.g.\ncustomerName, mobileNumber, vehicleNumber, vehicleType, brand, model\nRamesh Kumar, 9876500001, MH12AB1234, BIKE, Honda, Activa'
                }
                className="font-mono text-xs"
              />

              {parsed?.error && (
                <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {parsed.error}
                </p>
              )}

              {parsed && !parsed.error && parsed.unknownHeaders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Ignored unrecognised columns: {parsed.unknownHeaders.join(', ')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------------- step 3 */}
          {parsed && !parsed.error && parsed.rows.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">
                  3. Review ({parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'})
                </CardTitle>
                <Badge variant={validCount === parsed.rows.length ? 'completed' : 'pending'}>
                  {validCount} ready
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">#</th>
                        {PREVIEW_COLUMNS.map((col) => (
                          <th
                            key={col.field}
                            className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 100).map((row, i) => {
                        const invalid =
                          !row.customerName.trim() ||
                          row.mobileNumber.replace(/\D/g, '').length < 10 ||
                          !row.vehicleNumber.trim();
                        return (
                          <tr key={i} className={cn('border-t', invalid && 'bg-red-50')}>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                            {PREVIEW_COLUMNS.map((col) => (
                              <td key={col.field} className="whitespace-nowrap px-3 py-1.5">
                                {col.field === 'lastServiceAmount' && row[col.field]
                                  ? formatCurrency(Number(row[col.field]) || 0, garage.currency)
                                  : row[col.field] || <span className="text-muted-foreground">-</span>}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {parsed.rows.length > 100 && (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Showing the first 100 of {parsed.rows.length} rows. All rows will be imported.
                  </p>
                )}

                <div className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Rows highlighted red are missing a name, a valid 10-digit mobile, or a vehicle
                    number and will be reported as errors.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={startOver}>
                      Clear
                    </Button>
                    <Button
                      onClick={() => importMutation.mutate(parsed.rows)}
                      loading={importMutation.isPending}
                    >
                      <FileSpreadsheet /> Import {parsed.rows.length} row
                      {parsed.rows.length === 1 ? '' : 's'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function ResultPanel({
  result,
  currency,
  onDone,
}: {
  result: ImportResponse;
  currency: string;
  onDone: () => void;
}) {
  const { summary, results } = result;
  const problems = results.filter((r) => r.status !== 'created');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Import finished
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Added" value={summary.created} tone="emerald" />
          <Stat label="Skipped" value={summary.skipped} tone="amber" />
          <Stat label="Errors" value={summary.failed} tone={summary.failed ? 'red' : 'muted'} />
          <Stat label="Past bills" value={summary.servicesAdded} tone="muted" />
        </div>

        {summary.created > 0 && (
          <p className="text-sm text-muted-foreground">
            Your imported records are now live. Open{' '}
            <Link href="/vehicles" className="font-medium text-primary hover:underline">
              Vehicles
            </Link>{' '}
            or{' '}
            <Link href="/customers" className="font-medium text-primary hover:underline">
              Customers
            </Link>{' '}
            to see them.
          </p>
        )}

        {problems.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Rows that need attention</p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <tbody>
                  {problems.map((r) => (
                    <tr key={r.row} className="border-b last:border-0">
                      <td className="px-3 py-2 text-xs text-muted-foreground">Row {r.row}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.status === 'skipped' ? 'pending' : 'unpaid'}>
                          {r.status === 'skipped' ? 'Skipped' : 'Error'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onDone}>
            <X /> Import another batch
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'red' | 'muted';
}) {
  const tones = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-destructive',
    muted: 'text-foreground',
  };
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className={cn('text-2xl font-bold', tones[tone])}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
