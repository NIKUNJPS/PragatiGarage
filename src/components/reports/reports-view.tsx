'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';

import { api, errorMessage, qs } from '@/lib/client-api';
import {
  addDays,
  addMonths,
  browserTimeZone,
  formatDayKey,
  formatMonthKey,
  isDateKey,
  isMonthKey,
  monthKeyOf,
  todayKey,
} from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { DailyReportBody, downloadDailyCsv } from '@/components/reports/daily-report';
import { MonthlyReportBody, downloadMonthlyCsv } from '@/components/reports/monthly-report';
import type { DailyReport, MonthlyReport } from '@/types';

type View = 'daily' | 'monthly';

/**
 * Daily and monthly revenue reports. The selected view, day and month live in
 * the URL (?view=daily&date=2026-10-06 / ?view=monthly&month=2026-10), so a
 * report can be bookmarked, shared or reopened with the back button.
 */
export function ReportsView() {
  // The time zone is read after mount: the server render has no browser zone,
  // and "today" must be the garage's local day.
  const [timeZone, setTimeZone] = React.useState<string | null>(null);
  React.useEffect(() => setTimeZone(browserTimeZone()), []);

  if (!timeZone) {
    return (
      <div>
        <PageHeader title="Reports" description="Daily and monthly revenue." />
        <ReportSkeleton />
      </div>
    );
  }
  return <Reports timeZone={timeZone} />;
}

function Reports({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { garage } = useSession();

  const today = todayKey(timeZone);
  const thisMonth = monthKeyOf(today);

  const view: View = params.get('view') === 'monthly' ? 'monthly' : 'daily';
  const rawDate = params.get('date');
  const date = isDateKey(rawDate) && rawDate <= today ? rawDate : today;
  const rawMonth = params.get('month');
  const month = isMonthKey(rawMonth) && rawMonth <= thisMonth ? rawMonth : monthKeyOf(date);

  const navigate = React.useCallback(
    (next: Partial<Record<'view' | 'date' | 'month', string>>, scrollTop = false) => {
      const search = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value) search.set(key, value);
        else search.delete(key);
      }
      router.replace(`/reports?${search.toString()}`, { scroll: false });
      if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [params, router],
  );

  const daily = useQuery({
    queryKey: ['reports', 'daily', date, timeZone],
    queryFn: () => api.get<DailyReport>(`/api/reports/daily${qs({ date, tz: timeZone })}`),
    enabled: view === 'daily',
    placeholderData: keepPreviousData,
  });

  const monthly = useQuery({
    queryKey: ['reports', 'monthly', month, timeZone],
    queryFn: () => api.get<MonthlyReport>(`/api/reports/monthly${qs({ month, tz: timeZone })}`),
    enabled: view === 'monthly',
    placeholderData: keepPreviousData,
  });

  const active = view === 'daily' ? daily : monthly;
  const periodLabel = view === 'daily' ? formatDayKey(date) : formatMonthKey(month);

  const monthOptions = React.useMemo(
    () => Array.from({ length: 36 }, (_, i) => addMonths(thisMonth, -i)),
    [thisMonth],
  );

  const downloadCsv = () => {
    if (view === 'daily' && daily.data) downloadDailyCsv(daily.data, garage.name);
    if (view === 'monthly' && monthly.data) downloadMonthlyCsv(monthly.data, garage.name);
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Revenue billed and received - day by day and month by month."
        actions={
          <>
            <Button variant="outline" onClick={downloadCsv} disabled={!active.data || active.isPlaceholderData}>
              <Download /> Download CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!active.data}>
              <Printer /> Print
            </Button>
          </>
        }
      />

      {/* Printed reports carry their own heading, since the app chrome is hidden. */}
      <div className="mb-4 hidden print:block">
        <p className="text-lg font-bold">{garage.name}</p>
        <p className="text-sm">
          {view === 'daily' ? 'Daily report' : 'Monthly report'} - {periodLabel}
        </p>
      </div>

      {/* ------------------------------------------------ filter row */}
      <div className="mb-4 flex flex-col gap-3 no-print sm:flex-row sm:items-end sm:justify-between">
        <Tabs value={view} onValueChange={(v) => navigate({ view: v })}>
          <TabsList>
            <TabsTrigger value="daily">Daily report</TabsTrigger>
            <TabsTrigger value="monthly">Monthly report</TabsTrigger>
          </TabsList>
        </Tabs>

        {view === 'daily' ? (
          <div className="flex items-end gap-1.5">
            <StepButton label="Previous day" onClick={() => navigate({ date: addDays(date, -1) })}>
              <ChevronLeft />
            </StepButton>
            <div>
              <Label htmlFor="report-date" className="sr-only">
                Report date
              </Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="report-date"
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => isDateKey(e.target.value) && navigate({ date: e.target.value })}
                  className="h-9 w-[170px] pl-9"
                />
              </div>
            </div>
            <StepButton label="Next day" onClick={() => navigate({ date: addDays(date, 1) })} disabled={date >= today}>
              <ChevronRight />
            </StepButton>
            <Button
              variant={date === today ? 'secondary' : 'outline'}
              size="sm"
              className="h-9"
              onClick={() => navigate({ date: today })}
            >
              Today
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-1.5">
            <StepButton
              label="Previous month"
              onClick={() => navigate({ month: addMonths(month, -1) })}
              disabled={month <= monthOptions[monthOptions.length - 1]}
            >
              <ChevronLeft />
            </StepButton>
            <div>
              <Label htmlFor="report-month" className="sr-only">
                Report month
              </Label>
              <select
                id="report-month"
                value={month}
                onChange={(e) => navigate({ month: e.target.value })}
                className="h-9 w-[170px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {!monthOptions.includes(month) && <option value={month}>{formatMonthKey(month)}</option>}
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthKey(m)}
                  </option>
                ))}
              </select>
            </div>
            <StepButton
              label="Next month"
              onClick={() => navigate({ month: addMonths(month, 1) })}
              disabled={month >= thisMonth}
            >
              <ChevronRight />
            </StepButton>
            <Button
              variant={month === thisMonth ? 'secondary' : 'outline'}
              size="sm"
              className="h-9"
              onClick={() => navigate({ month: thisMonth })}
            >
              This month
            </Button>
          </div>
        )}
      </div>

      {/* --------------------------------------------------- report */}
      {active.isLoading ? (
        <ReportSkeleton />
      ) : active.isError || !active.data ? (
        <Card>
          <ErrorState
            title="Could not load this report"
            message={errorMessage(active.error)}
            onRetry={() => void active.refetch()}
          />
        </Card>
      ) : (
        // While a new period loads, the previous one stays in place, dimmed.
        <div className={cn('transition-opacity', active.isPlaceholderData && 'pointer-events-none opacity-60')}>
          <h2 className="mb-3 text-base font-semibold no-print">{periodLabel}</h2>
          {view === 'daily' && daily.data ? (
            <DailyReportBody report={daily.data} />
          ) : monthly.data ? (
            <MonthlyReportBody
              report={monthly.data}
              onOpenDay={(d) => navigate({ view: 'daily', date: d }, true)}
              onSelectMonth={(m) => navigate({ month: m }, true)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button variant="outline" size="icon" className="h-9 w-9" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    </div>
  );
}
