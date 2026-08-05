import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'projects'
  | 'bug'
  | 'roadmap'
  | 'milestone'
  | 'docs'
  | 'inbox'
  | 'tasks'
  | 'user-check'
  | 'calendar'
  | 'user-list'
  | 'people'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'menu'
  | 'more'
  | 'logout'
  | 'checks'
  | 'close'
  // Team symbols — pickable per team, see TEAM_ICONS in types/enums.
  | 'code'
  | 'flask'
  | 'shield'
  | 'rocket'
  | 'pen'
  | 'chart'
  | 'database'
  | 'server'
  | 'book'
  | 'megaphone'
  | 'wrench'
  | 'sparkles'
  | 'flag'
  | 'zap'
  | 'cloud'
  | 'lock'
  | 'compass'
  | 'package'
  | 'globe'
  | 'headphones'
  | 'comment';

/**
 * The figure "My Tasks" and its "Personal List" child share, so the parent row
 * and the child read as the same person wearing a different mark. It is drawn as
 * one continuous line — an open head ring whose stroke leaves the lower left as a
 * swoosh and flattens into a base — rather than Feather's closed head + shoulder
 * arc, which is why it isn't built from the `people` glyph. Deliberately has no
 * right-hand shoulder: the empty quadrant is what leaves room for the check or
 * the list to tuck in underneath the head.
 */
const PERSON = (
  <path d="M14.9 9.5A5.4 5.4 0 1 0 6 11.5C5 13.5 1.9 15.8 1.9 19.9Q1.9 21.3 3.3 21.3H9" />
);

/* Feather/Lucide-style line icons — stroke via currentColor, like ThemeToggle. */
const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  projects: (
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ),
  bug: (
    <>
      <rect x="8" y="6" width="8" height="12" rx="4" />
      <path d="M12 6v12M6 11H3M6 15H3M18 11h3M18 15h3M7 8L4 6M17 8l3-2M7 17l-3 2M17 17l3 2" />
    </>
  ),
  /* A route: start marker → winding path → destination marker. */
  roadmap: (
    <>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
    </>
  ),
  milestone: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  /* A page with a turned corner and three lines of writing — Lucide's `FileText`,
     path for path. The Docs feature already draws itself with that exact glyph
     everywhere it appears (hub tabs, page tree, linked docs, the public view), so
     the nav row is the same page rather than a near-miss of it. Deliberately not
     the `book` team symbol this used to borrow: a team can pick `book` for itself,
     and then one mark in one sidebar means two different things. */
  docs: (
    <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8M16 13H8M16 17H8" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  tasks: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  people: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  /* My Tasks — the person, ticked. The check sits low, beside the body rather
     than up by the head, so it lands in the quadrant `PERSON` leaves empty. */
  'user-check': (
    <>
      {PERSON}
      <path d="M15 17l2 1.7 3.5-3.3" />
    </>
  ),
  /* The dot is the point of this one: it marks *today* inside the month, which
     is the row it labels. The divider sits close under the top edge, so the two
     strokes read as one solid header bar at 18px — that's the reference, not a
     collision. Tabs are loops, not ticks. */
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 8h18" />
      <path d="M5.9 5V3.5a1.5 1.5 0 0 1 3 0V5M14.7 5V3.5a1.5 1.5 0 0 1 3 0V5" />
      <circle cx="16" cy="16" r="1" />
    </>
  ),
  /* Personal List — the same person against two list rows (bullet + line). Not
     the bare list lines: the row is a *personal* board, and the figure is what
     says so next to its "My Tasks" parent. */
  'user-list': (
    <>
      {PERSON}
      {/* Bullets are `r < strokeWidth/2` circles, so the stroke closes over the
          centre and they render as solid dots — a thin dash reads too light
          against the line beside it. */}
      <circle cx="14.3" cy="15" r="0.6" />
      <circle cx="14.3" cy="21" r="0.6" />
      <path d="M18.6 15h2.9M18.6 21h2.9" />
    </>
  ),
  settings: (
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  ),
  'chevron-left': <path d="M15 18l-6-6 6-6" />,
  'chevron-right': <path d="M9 18l6-6-6-6" />,
  menu: <path d="M3 12h18M3 6h18M3 18h18" />,
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  /* Double tick — a list of work items, against the single tick inside `tasks`
     for one. Two identical ticks a third of a glyph apart, and flat (18 wide by
     8 tall) so the pair still reads as two at 18px rather than one thick mark. */
  checks: (
    <>
      <path d="M3 11l5 5 7-8" />
      <path d="M9 11l5 5 7-8" />
    </>
  ),
  close: <path d="M18 6L6 18M6 6l12 12" />,
  /* "More" — the nav rail's everything-else stop. A 3×3 grid, drawn as filled
     dots rather than stroked circles: at 20px a 2px stroke on a 3px circle fills
     it in anyway, and nine of those read as a smudge. */
  more: (
    <g fill="currentColor" stroke="none">
      {[5, 12, 19].flatMap((cy) =>
        [5, 12, 19].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" />),
      )}
    </g>
  ),
  code: <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />,
  flask: (
    <>
      <path d="M14 2v6l4.5 9a1 1 0 0 1-.9 1.5H6.4a1 1 0 0 1-.9-1.5L10 8V2" />
      <path d="M8.5 2h7M7 16h10" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91 0z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </>
  ),
  pen: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  chart: <path d="M18 20V10M12 20V4M6 20v-6" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </>
  ),
  server: (
    <>
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <path d="M6 6h.01M6 18h.01" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 11l18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  sparkles: (
    <>
      <path d="M12 3l-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
      <path d="M5 3v4M19 17v4M3 5h4M17 19h4" />
    </>
  ),
  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
  zap: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  cloud: <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />,
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </>
  ),
  package: (
    <>
      <path d="M16.5 9.4l-9-5.19" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  headphones: (
    <>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </>
  ),
  /* A speech bubble — an MCP comment event. */
  comment: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 18, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
