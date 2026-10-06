'use client';

import * as React from 'react';

import { cn, formatCurrency, formatCurrencyCompact } from '@/lib/utils';

export interface ColumnDatum {
  key: string;
  /** Short x-axis label ("6", "Oct"). */
  tick: string;
  /** Full label for the tooltip and screen readers ("Tue, 06 Oct 2026"). */
  label: string;
  value: number;
  /** Other figures shown in the tooltip under the plotted value. */
  details?: Array<{ label: string; value: string }>;
}

/**
 * Single-series column chart (money on one axis). Thin columns with a rounded
 * data end, a hairline grid, and a tooltip on hover and keyboard focus. With
 * `highlightKey` the chart switches to emphasis: that column in the accent,
 * the rest in a lighter step of the same hue. The page always shows the same
 * numbers in a table, so the tooltip never gates a value.
 */
export function ColumnChart({
  data,
  currency,
  measureLabel,
  highlightKey,
  showTick = () => true,
  onSelect,
  height = 176,
  className,
}: {
  data: ColumnDatum[];
  currency: string;
  measureLabel: string;
  highlightKey?: string;
  /** Whether to label a column: always, never, or only on screens wide enough ('wide'). */
  showTick?: (index: number) => boolean | 'wide';
  onSelect?: (key: string) => void;
  height?: number;
  className?: string;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)));
  const top = ticks[ticks.length - 1] || 1;
  const empty = data.every((d) => d.value === 0);
  const activeDatum = active !== null ? data[active] : null;

  return (
    <figure className={cn('select-none pt-2', className)} aria-label={`${measureLabel} chart`}>
      <div className="flex">
        {/* y-axis ticks */}
        <div className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" style={{ height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-2 -translate-y-1/2 leading-none"
              style={{ top: `${100 - (t / top) * 100}%` }}
            >
              {formatCurrencyCompact(t, currency).replace(/\.00$/, '')}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={() => setActive(null)}>
          {/* hairline grid */}
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={cn('absolute inset-x-0 h-px', t === 0 ? 'bg-slate-300' : 'bg-slate-100')}
              style={{ top: `${100 - (t / top) * 100}%` }}
            />
          ))}

          {empty && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Nothing recorded in this period
            </p>
          )}

          {/* columns: the whole slot is the hit target, not just the painted bar */}
          <div className="absolute inset-0 flex items-stretch gap-[2px]">
            {data.map((d, i) => {
              const pct = (d.value / top) * 100;
              const muted = highlightKey !== undefined && d.key !== highlightKey;
              const Tag = onSelect ? 'button' : 'div';
              return (
                <Tag
                  key={d.key}
                  type={onSelect ? 'button' : undefined}
                  tabIndex={onSelect ? undefined : 0}
                  aria-label={`${d.label}: ${measureLabel} ${formatCurrency(d.value, currency)}`}
                  onClick={onSelect ? () => onSelect(d.key) : undefined}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group relative flex min-w-0 flex-1 items-end justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'block w-full max-w-[24px] rounded-t-[4px] transition-opacity',
                      muted ? 'bg-[hsl(214_55%_82%)]' : 'bg-primary',
                      active === i ? 'opacity-80' : 'opacity-100',
                    )}
                    style={{ height: d.value > 0 ? `max(${pct}%, 2px)` : 0 }}
                  />
                </Tag>
              );
            })}
          </div>

          {/* tooltip */}
          {activeDatum && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 w-max max-w-[220px] rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
              style={{
                left: `${((active + 0.5) / data.length) * 100}%`,
                transform: `translateX(${active < data.length / 3 ? '-10%' : active > (data.length * 2) / 3 ? '-90%' : '-50%'})`,
              }}
            >
              <p className="font-medium text-muted-foreground">{activeDatum.label}</p>
              <p className="mt-1 flex items-center gap-2">
                <span aria-hidden className="h-0.5 w-3 rounded bg-primary" />
                <span className="text-sm font-bold text-foreground">{formatCurrency(activeDatum.value, currency)}</span>
                <span className="text-muted-foreground">{measureLabel}</span>
              </p>
              {activeDatum.details?.map((row) => (
                <p key={row.label} className="mt-0.5 flex justify-between gap-4 text-muted-foreground">
                  <span>{row.label}</span>
                  <span className="font-semibold text-foreground">{row.value}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* x-axis ticks */}
      <div className="ml-12 mt-1.5 flex gap-[2px] text-[11px] text-muted-foreground" aria-hidden>
        {data.map((d, i) => {
          const tick = showTick(i);
          return (
            <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
              {tick && <span className={tick === 'wide' ? 'hidden sm:inline' : undefined}>{d.tick}</span>}
            </span>
          );
        })}
      </div>
    </figure>
  );
}

/** 0 plus 3-5 round steps covering `max` (1, 2, 2.5 or 5 x a power of ten). */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}
