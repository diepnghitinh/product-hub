import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GANTT_DAY, GanttChart, type GanttRow } from './GanttChart';

/**
 * The chart's **toolbar slot** — the roadmap's Gantt ↔ Calendar switch lives in
 * it, and "the switch disappeared" is the failure this file exists to catch.
 *
 * The slot has to survive all three of the chart's shapes, not just the happy
 * one: a timeline that is still loading, or that has nothing to draw, must still
 * offer the way *out* of itself. A control that vanishes exactly when the view is
 * empty strands you in the empty view.
 */

// React 18's act() needs to be told it's in a test environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

/** Render into a detached container and hand back its text. */
function render(node: Parameters<Root['render']>[0]): string {
  act(() => {
    root.render(node);
  });
  return host.textContent ?? '';
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

const TOOLBAR = createElement('button', { type: 'button' }, 'SWITCH');
const ROWS: GanttRow[] = [
  {
    id: 'a',
    label: 'Item A',
    bar: { start: Date.now(), end: Date.now() + 3 * GANTT_DAY, color: 'hsl(var(--primary))' },
  },
];

describe('GanttChart toolbar slot', () => {
  it('renders beside the legend when the chart has rows', () => {
    const text = render(
      createElement(GanttChart, { rows: ROWS, labelHeader: 'Item', toolbar: TOOLBAR }),
    );
    expect(text).toContain('SWITCH');
    expect(text).toContain('Item A');
  });

  it('stays on screen while the chart is loading', () => {
    const text = render(
      createElement(GanttChart, { rows: [], labelHeader: 'Item', toolbar: TOOLBAR, isLoading: true }),
    );
    expect(text).toContain('SWITCH');
  });

  it('stays on screen when there is nothing to draw', () => {
    const text = render(
      createElement(GanttChart, {
        rows: [],
        labelHeader: 'Item',
        toolbar: TOOLBAR,
        empty: { title: 'Nothing here' },
      }),
    );
    expect(text).toContain('SWITCH');
    expect(text).toContain('Nothing here');
  });

  it('draws no header row at all when nothing was passed for one', () => {
    const text = render(createElement(GanttChart, { rows: ROWS, labelHeader: 'Item' }));
    expect(text).not.toContain('SWITCH');
  });
});
