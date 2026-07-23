import { useId, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { shortDay, todayIso } from './dates';
import type { CycleBurndownDto, CycleBurndownPoint } from '@/types/dto';

/** Round a max up to a friendly axis bound (mirrors the roadmap RICE chart). */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

const SCOPE_INK = 'hsl(var(--muted-foreground))';

/**
 * A cycle's burn-up, hand-drawn in SVG (no chart dep — same approach as the
 * roadmap RICE chart). Scope is the grey envelope; Started and Completed are
 * nested areas in the team's own column colours (so the chart matches the
 * board's status dots), with a faint diagonal "ideal completion" guide. The
 * future portion of an active cycle is hatched, and hovering reads out a day.
 *
 * The series is reconstructed from issue timestamps (see the endpoint), so it's
 * "best known", not an audited log — the drawer states that once, near the tabs.
 */
export function CycleBurnupChart({ data }: { data: CycleBurndownDto }) {
  const gradId = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => normalise(data), [data]);
  const n = points.length;

  // Geometry — a fixed viewBox scaled to the container via `w-full h-auto`.
  const W = 720;
  const H = 240;
  const m = { top: 14, right: 14, bottom: 26, left: 30 };
  const innerW = W - m.left - m.right;
  const innerH = H - m.top - m.bottom;

  const started = (p: CycleBurndownPoint) =>
    data.unit === 'points' ? p.startedPoints : p.startedCount;
  const completed = (p: CycleBurndownPoint) =>
    data.unit === 'points' ? p.completedPoints : p.completedCount;
  const scope = (p: CycleBurndownPoint) => (data.unit === 'points' ? p.scopePoints : p.scopeCount);

  const finalScope = n ? scope(points[n - 1]) : 0;
  const yMax = niceMax(Math.max(1, finalScope));

  const xAt = (i: number) => m.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => m.top + innerH - (v / yMax) * innerH;
  const baseY = m.top + innerH;

  // today → x, so the future can be hatched and a "now" line drawn. Clamp to the
  // window: a completed cycle has no future band; an upcoming one is all future.
  const today = todayIso();
  const todayIdx = useMemo(() => {
    if (!n) return -1;
    if (today < points[0].date) return 0;
    if (today > points[n - 1].date) return n - 1;
    return points.findIndex((p) => p.date >= today);
  }, [points, n, today]);
  const showFuture = data.status !== 'completed' && todayIdx >= 0 && todayIdx < n - 1;
  const todayX = todayIdx >= 0 ? xAt(todayIdx) : null;

  const startedColorC = data.startedColor || '#2563eb';
  const completedColorC = data.completedColor || '#16a34a';
  const grid = 'hsl(var(--border))';

  const areaPath = (val: (p: CycleBurndownPoint) => number) => buildArea(points, val, xAt, yAt, baseY);
  const linePath = (val: (p: CycleBurndownPoint) => number) => buildLine(points, val, xAt, yAt);

  // y ticks — a few faint gridlines with small labels.
  const ticks = [0, 0.5, 1].map((f) => Math.round(yMax * f));

  const onMove = (e: React.PointerEvent) => {
    if (n <= 1) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Map the pointer into viewBox units, then to the nearest day index.
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const f = (vx - m.left) / innerW;
    const idx = Math.round(f * (n - 1));
    setHover(idx < 0 ? 0 : idx >= n ? n - 1 : idx);
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={t('cycles.insights.chartAria')}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${gradId}-started`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={startedColorC} stopOpacity={0.22} />
            <stop offset="100%" stopColor={startedColorC} stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id={`${gradId}-done`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={completedColorC} stopOpacity={0.32} />
            <stop offset="100%" stopColor={completedColorC} stopOpacity={0.08} />
          </linearGradient>
          <pattern
            id={`${gradId}-hatch`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={grid} strokeWidth="1" />
          </pattern>
        </defs>

        {/* y gridlines + labels */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.left} y1={yAt(v)} x2={W - m.right} y2={yAt(v)} stroke={grid} strokeWidth={1} />
            <text x={m.left - 6} y={yAt(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px] tabular-nums">
              {v}
            </text>
          </g>
        ))}

        {/* future band (active cycle only) */}
        {showFuture && todayX != null && (
          <rect
            x={todayX}
            y={m.top}
            width={W - m.right - todayX}
            height={innerH}
            fill={`url(#${gradId}-hatch)`}
            opacity={0.6}
          />
        )}

        {/* scope envelope: faint grey fill + a thin top line */}
        <path d={`${areaPath(scope)}`} fill={SCOPE_INK} fillOpacity={0.05} />
        <path d={linePath(scope)} fill="none" stroke={SCOPE_INK} strokeOpacity={0.5} strokeWidth={1.5} />

        {/* started area (nested inside scope) */}
        <path d={areaPath(started)} fill={`url(#${gradId}-started)`} />
        <path d={linePath(started)} fill="none" stroke={startedColorC} strokeWidth={2} strokeLinejoin="round" />

        {/* completed area (nested inside started) */}
        <path d={areaPath(completed)} fill={`url(#${gradId}-done)`} />
        <path d={linePath(completed)} fill="none" stroke={completedColorC} strokeWidth={2} strokeLinejoin="round" />

        {/* ideal completion guide: 0 at the start → full scope at the end */}
        <line
          x1={xAt(0)}
          y1={baseY}
          x2={xAt(n - 1)}
          y2={yAt(finalScope)}
          stroke={SCOPE_INK}
          strokeOpacity={0.4}
          strokeWidth={1.25}
          strokeDasharray="4 4"
        />

        {/* today line */}
        {todayX != null && data.status === 'active' && (
          <line x1={todayX} y1={m.top} x2={todayX} y2={baseY} stroke={SCOPE_INK} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 3" />
        )}

        {/* x baseline + date labels (start · mid · end) */}
        <line x1={m.left} y1={baseY} x2={W - m.right} y2={baseY} stroke={grid} strokeWidth={1} />
        {n > 0 &&
          [0, Math.floor((n - 1) / 2), n - 1]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((i, k, arr) => (
              <text
                key={i}
                x={xAt(i)}
                y={H - 8}
                textAnchor={k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[9px]"
              >
                {shortDay(points[i].date)}
              </text>
            ))}

        {/* hover guide + markers */}
        {hp && (
          <g pointerEvents="none">
            <line x1={xAt(hover!)} y1={m.top} x2={xAt(hover!)} y2={baseY} stroke={SCOPE_INK} strokeOpacity={0.35} strokeWidth={1} />
            <circle cx={xAt(hover!)} cy={yAt(scope(hp))} r={3} fill={SCOPE_INK} />
            <circle cx={xAt(hover!)} cy={yAt(started(hp))} r={3} fill={startedColorC} />
            <circle cx={xAt(hover!)} cy={yAt(completed(hp))} r={3} fill={completedColorC} />
          </g>
        )}
      </svg>

      {/* hover tooltip — positioned over the wrapper by fraction of width */}
      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md"
          style={{ left: `${(xAt(hover!) / W) * 100}%` }}
        >
          <div className="mb-1 text-[11px] font-medium">{shortDay(hp.date)}</div>
          <TooltipRow color={SCOPE_INK} label={t('cycles.insights.scope')} value={scope(hp)} />
          <TooltipRow color={startedColorC} label={t('cycles.insights.started')} value={started(hp)} />
          <TooltipRow color={completedColorC} label={t('cycles.insights.completed')} value={completed(hp)} />
        </div>
      )}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
      <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 font-medium">{value}</span>
    </div>
  );
}

/** A cycle is always ≥1 day, but guard an empty/degenerate series so callers can
 *  render the chart or an empty state without special-casing here. */
function normalise(data: CycleBurndownDto): CycleBurndownPoint[] {
  return data.series ?? [];
}

/** `M…L…` polyline through the values. */
function buildLine(
  points: CycleBurndownPoint[],
  val: (p: CycleBurndownPoint) => number,
  xAt: (i: number) => number,
  yAt: (v: number) => number,
): string {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(val(p))}`).join(' ');
}

/** The same polyline, closed down to the baseline for a filled area. */
function buildArea(
  points: CycleBurndownPoint[],
  val: (p: CycleBurndownPoint) => number,
  xAt: (i: number) => number,
  yAt: (v: number) => number,
  baseY: number,
): string {
  if (!points.length) return '';
  const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(val(p))}`).join(' ');
  return `${top} L${xAt(points.length - 1)},${baseY} L${xAt(0)},${baseY} Z`;
}

/** Small legend swatch reused by the drawer's Statistics row. */
export function StatSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-[3px]', className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
