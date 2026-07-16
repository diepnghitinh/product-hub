import { useState } from 'react';
import { ROADMAP_ITEM_STATUS_LABEL } from '@/types/enums';
import type { RoadmapColumn, RoadmapItem } from '@/types/dto';

function niceMax(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}
function ticks(max: number, count = 5): number[] {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => +(i * step).toFixed(2));
}
const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/**
 * RICE prioritization bubble chart: x = Effort, y = Impact, bubble size = Reach,
 * colour = Confidence (red → green). Quadrants label the trade-offs. Theme-aware
 * (shadcn tokens); ported from the legacy roadmap RICE chart.
 */
export function RoadmapRiceChart({
  items,
  columns,
}: {
  items: RoadmapItem[];
  columns: RoadmapColumn[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const scored = items.filter((i) => i.effort > 0 || i.impact > 0 || i.reach > 0);

  if (scored.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        Set Reach, Impact, Confidence and Effort on items to see the prioritization chart.
      </div>
    );
  }

  const width = 760;
  const height = 440;
  const m = { top: 24, right: 32, bottom: 48, left: 56 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const xMax = niceMax(Math.max(1, ...scored.map((i) => i.effort)));
  const yMax = niceMax(Math.max(1, ...scored.map((i) => i.impact)));
  const reachMax = Math.max(1, ...scored.map((i) => i.reach));
  const maxConf = Math.max(1, ...scored.map((i) => i.confidence));

  const xScale = (v: number) => (v / xMax) * innerW;
  const yScale = (v: number) => innerH - (v / yMax) * innerH;
  const rScale = (v: number) => 6 + (Math.sqrt(Math.max(0, v)) / Math.sqrt(reachMax)) * 24;
  const color = (conf: number) => `hsl(${Math.round((conf / maxConf) * 120)} 62% 47%)`;

  const active = activeId ? scored.find((s) => s.id === activeId) : null;
  const grid = 'hsl(var(--border))';
  const ink = 'hsl(var(--muted-foreground))';

  return (
    <div className="relative w-full rounded-xl border bg-card p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="RICE prioritization bubble chart"
        onMouseLeave={() => setActiveId(null)}
      >
        <g transform={`translate(${m.left} ${m.top})`}>
          {ticks(yMax).map((tk) => (
            <line key={`yg${tk}`} x1={0} x2={innerW} y1={yScale(tk)} y2={yScale(tk)} stroke={grid} strokeDasharray="3 3" />
          ))}
          {ticks(xMax).map((tk) => (
            <line key={`xg${tk}`} x1={xScale(tk)} x2={xScale(tk)} y1={0} y2={innerH} stroke={grid} strokeDasharray="3 3" />
          ))}

          <text x={4} y={12} fontSize={10} fill={ink} opacity={0.7}>Quick wins</text>
          <text x={innerW - 4} y={12} textAnchor="end" fontSize={10} fill={ink} opacity={0.7}>Big bets</text>
          <text x={4} y={innerH - 4} fontSize={10} fill={ink} opacity={0.7}>Fill-ins</text>
          <text x={innerW - 4} y={innerH - 4} textAnchor="end" fontSize={10} fill={ink} opacity={0.7}>Money pit</text>

          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={ink} />
          <line x1={0} x2={0} y1={0} y2={innerH} stroke={ink} />
          {ticks(xMax).map((tk) => (
            <g key={`xt${tk}`} transform={`translate(${xScale(tk)} ${innerH})`}>
              <line y2={4} stroke={ink} />
              <text y={18} textAnchor="middle" fontSize={10} fill={ink}>{tk}</text>
            </g>
          ))}
          {ticks(yMax).map((tk) => (
            <g key={`yt${tk}`} transform={`translate(0 ${yScale(tk)})`}>
              <line x2={-4} stroke={ink} />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={ink}>{tk}</text>
            </g>
          ))}
          <text x={innerW / 2} y={innerH + 38} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink}>Effort →</text>
          <text transform={`translate(-42 ${innerH / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={600} fill={ink}>Impact ↑</text>

          {[...scored]
            .sort((a, b) => b.reach - a.reach)
            .map((item) => {
              const cx = xScale(Math.min(item.effort, xMax));
              const cy = yScale(Math.min(item.impact, yMax));
              const r = rScale(item.reach);
              const isA = activeId === item.id;
              return (
                <g key={item.id} onMouseEnter={() => setActiveId(item.id)} style={{ cursor: 'pointer' }}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={color(item.confidence)}
                    fillOpacity={isA ? 0.85 : 0.5}
                    stroke={color(item.confidence)}
                    strokeWidth={isA ? 2.5 : 1.5}
                  />
                  <text x={cx} y={cy} textAnchor="middle" dy="0.32em" fontSize={10} fontWeight={500} fill="#fff" pointerEvents="none">
                    {truncate(item.title, 12)}
                  </text>
                </g>
              );
            })}
        </g>
      </svg>

      {active && (
        <div className="pointer-events-none absolute right-4 top-4 w-56 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
          <div className="text-sm font-semibold leading-snug">{active.title}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded bg-muted px-1.5 py-0.5">
              {columns.find((c) => c.key === active.phase)?.label ?? active.phase}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5">{ROADMAP_ITEM_STATUS_LABEL[active.status]}</span>
            <span className="rounded bg-muted px-1.5 py-0.5">{active.progress}%</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Reach</dt>
            <dd className="text-right font-mono">{active.reach}</dd>
            <dt className="text-muted-foreground">Impact</dt>
            <dd className="text-right font-mono">{active.impact}</dd>
            <dt className="text-muted-foreground">Confidence</dt>
            <dd className="text-right font-mono">{active.confidence}</dd>
            <dt className="text-muted-foreground">Effort</dt>
            <dd className="text-right font-mono">{active.effort}</dd>
            <dt className="font-medium">RICE</dt>
            <dd className="text-right font-mono font-semibold">{active.rice}</dd>
          </dl>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="font-medium">Confidence</span>
        <span
          className="h-2 w-24 rounded-full"
          style={{ background: 'linear-gradient(90deg, hsl(0 62% 47%), hsl(60 62% 47%), hsl(120 62% 47%))' }}
        />
        <span>low → high</span>
        <span className="mx-1 h-3 w-px bg-border" />
        <span className="font-medium">Bubble size = Reach</span>
      </div>
    </div>
  );
}
