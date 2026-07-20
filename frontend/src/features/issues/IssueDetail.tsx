import type { ReactNode } from 'react';
import { IssueDetailMain, type IssueDetailMainProps } from './IssueDetailMain';

/** Uppercase muted label for one Properties row — shared by both sidebars. */
const PROP_LABEL = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

/** One labelled row in the Properties sidebar (label + its control). */
export function PropField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={PROP_LABEL}>{label}</span>
      {children}
    </div>
  );
}

interface IssueDetailProps extends IssueDetailMainProps {
  /** The Properties rows + delete action — the one part that differs between a
   *  task and a bug. Build them from <PropField>. */
  sidebar: ReactNode;
}

/**
 * The whole issue-detail body, shared by Task detail and Bug detail: the shared
 * main column (title · description · activity) beside a Properties sidebar. The
 * two pages differ only in the `sidebar` rows they pass and how the page wraps
 * this (a route breadcrumb, or the inbox's in-place pane).
 *
 * Give it `key={issueId}` at the call site so a new subject gets a fresh subtree
 * — the uncontrolled title / description / type inputs seed from their initial
 * value once, which matters where the component is reused in place (the inbox).
 */
export function IssueDetail({ sidebar, ...main }: IssueDetailProps) {
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
      <IssueDetailMain {...main} />
      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:sticky md:top-6">
        {sidebar}
      </aside>
    </div>
  );
}
