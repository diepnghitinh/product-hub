/**
 * Pinning a comment to a passage of text.
 *
 * A doc page is stored as one HTML string that autosaves on every pause in
 * typing, and its blocks carry no ids. So a comment can't point at "block 4,
 * characters 12–40": the next paragraph anyone adds above it moves that passage
 * and the comment would quietly end up on the wrong sentence — the one failure
 * mode that makes a comment feature worse than none.
 *
 * Instead a comment stores the *quote* plus a little of the text either side of
 * it (the W3C Web Annotation "text quote selector"), and the quote is found
 * again in the rendered DOM every time the page paints. Editing elsewhere on the
 * page doesn't touch it. Editing *the quote itself* until it no longer exists
 * leaves the comment orphaned — which the sidebar says out loud, instead of
 * pretending it still points at something.
 *
 * Nothing here writes to the DOM. Highlights are painted as an overlay from
 * {@link rectsForRange}, so a comment can never end up inside the saved HTML,
 * the version history, or the public share view.
 */

/** Longest quote we keep. Mirrors the backend's `ANCHOR_EXACT_MAX`. */
export const ANCHOR_EXACT_MAX = 400;
/** How much text either side we keep to tell repeated quotes apart. */
export const ANCHOR_CONTEXT_MAX = 64;

export interface TextAnchor {
  /** The quoted passage itself. */
  exact: string;
  /** The text immediately before it. */
  prefix: string;
  /** The text immediately after it. */
  suffix: string;
  /** Where the quote sat when the comment was written — a tie-breaker between
   *  repeats of the same phrase, never the answer on its own. */
  start: number;
}

/**
 * Subtrees whose text isn't part of the document.
 *
 * Editor.js keeps its toolbars and popovers inside the same root as the blocks,
 * and those carry real words ("Heading", "Convert to", "Click to tune"). Walked
 * as content they'd shift every offset on the page and let a quote match a menu
 * item. A diagram is stored as source *and* drawn as an SVG — neither is prose.
 */
const SKIP_SELECTOR = [
  '.ce-toolbar',
  '.ce-inline-toolbar',
  '.ce-conversion-toolbar',
  '.ce-settings',
  '.ce-popover',
  '.ce-toolbox',
  '.codex-editor__loader',
  '.code-copy-btn',
  '.mermaid-source',
  '.mermaid-render',
  '.doc-comment-layer',
  'svg',
  'script',
  'style',
  'textarea',
  'input',
  'button',
].join(',');

/**
 * Elements that end a line of text. Two adjacent blocks have no whitespace
 * between them in the DOM, so without a separator `<p>end</p><p>Start</p>`
 * reads as `endStart` — a quote could span the seam and the sidebar would show
 * a phrase nobody wrote.
 */
const BLOCK_SELECTOR =
  'p,div,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote,figure,figcaption,section,article,tr,br';

interface CharPos {
  node: Text;
  /** Offset of the raw character this one came from. */
  offset: number;
  /** A separator we inserted at a block boundary — not really in the document. */
  synthetic: boolean;
}

export interface TextIndex {
  /** The page as one string, whitespace collapsed. */
  text: string;
  /** Where each character of `text` lives in the DOM. */
  map: CharPos[];
  root: HTMLElement;
}

/**
 * Editor.js nests the blocks in `.codex-editor__redactor` and hangs its chrome
 * off the root beside it. Narrowing to the redactor keeps the walk to content
 * and means the same page indexes identically whether it's being read or edited.
 */
export function contentRoot(el: HTMLElement | null | undefined): HTMLElement | null {
  if (!el) return null;
  return el.querySelector<HTMLElement>('.codex-editor__redactor') ?? el;
}

function blockOf(node: Text, root: HTMLElement): Element {
  const el = node.parentElement;
  const block = el?.closest(BLOCK_SELECTOR);
  return block && root.contains(block) ? block : root;
}

/** Walk `root`'s prose into one normalized string plus a DOM position per char. */
export function indexRoot(root: HTMLElement): TextIndex {
  const map: CharPos[] = [];
  let text = '';
  if (typeof document === 'undefined') return { text, map, root };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const skipped = parent.closest(SKIP_SELECTOR);
      if (skipped && root.contains(skipped)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let prevBlock: Element | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const raw = node.data;
    if (!raw) continue;
    const block = blockOf(node, root);
    if (prevBlock && block !== prevBlock && text.length && !/\s$/.test(text)) {
      text += ' ';
      map.push({ node, offset: 0, synthetic: true });
    }
    prevBlock = block;
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (/\s/.test(ch)) {
        // A run of whitespace becomes one space, and only if something real
        // precedes it — leading indentation isn't part of the text.
        if (!text.length || /\s$/.test(text)) continue;
        text += ' ';
        map.push({ node, offset: i, synthetic: false });
        continue;
      }
      text += ch;
      map.push({ node, offset: i, synthetic: false });
    }
  }

  return { text, map, root };
}

/**
 * Index of the first character at or after a DOM point. Binary search: character
 * positions run in document order, so `comparePoint` is monotonic over them and
 * this costs ~13 DOM comparisons instead of one per character.
 */
function pointToIndex(idx: TextIndex, container: Node, offset: number): number {
  if (!idx.map.length) return 0;
  const probe = document.createRange();
  try {
    probe.setStart(container, offset);
    probe.collapse(true);
  } catch {
    return 0;
  }
  let lo = 0;
  let hi = idx.map.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const pos = idx.map[mid];
    let cmp = 1;
    try {
      cmp = probe.comparePoint(pos.node, pos.offset);
    } catch {
      cmp = 1;
    }
    if (cmp >= 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Describe what a selection quotes, or `null` when it quotes nothing worth
 * anchoring (an empty or whitespace-only drag).
 */
export function describeRange(root: HTMLElement, range: Range): TextAnchor | null {
  const idx = indexRoot(root);
  if (!idx.text) return null;
  let start = pointToIndex(idx, range.startContainer, range.startOffset);
  let end = pointToIndex(idx, range.endContainer, range.endOffset);
  if (end <= start) return null;
  while (start < end && /\s/.test(idx.text[start])) start += 1;
  while (end > start && /\s/.test(idx.text[end - 1])) end -= 1;
  if (end <= start) return null;
  // A quote longer than the cap is stored truncated, so its suffix has to be
  // read from where the *stored* quote ends or it would never match again.
  const stop = Math.min(end, start + ANCHOR_EXACT_MAX);
  return {
    exact: idx.text.slice(start, stop),
    prefix: idx.text.slice(Math.max(0, start - ANCHOR_CONTEXT_MAX), start),
    suffix: idx.text.slice(stop, stop + ANCHOR_CONTEXT_MAX),
    start,
  };
}

const commonPrefixLen = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};

const commonSuffixLen = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
};

/** Every hit is a candidate; stop counting once a phrase is clearly boilerplate. */
const MAX_CANDIDATES = 200;

function findOccurrences(text: string, needle: string): number[] {
  const hits: number[] = [];
  for (
    let i = text.indexOf(needle);
    i !== -1 && hits.length < MAX_CANDIDATES;
    i = text.indexOf(needle, i + 1)
  ) {
    hits.push(i);
  }
  return hits;
}

/**
 * Which occurrence of the quote this anchor meant. Context wins — the words
 * either side are what distinguish the third "See below" from the first — and
 * the old position only breaks a tie, discounted so that a page edited above the
 * quote still resolves.
 */
function bestOccurrence(text: string, anchor: TextAnchor): number {
  let hits = findOccurrences(text, anchor.exact);
  if (!hits.length) {
    // A capitalization fix shouldn't orphan a thread.
    const lowered = findOccurrences(text.toLowerCase(), anchor.exact.toLowerCase());
    if (!lowered.length) return -1;
    hits = lowered;
  }
  if (hits.length === 1) return hits[0];

  let best = hits[0];
  let bestScore = -Infinity;
  for (const at of hits) {
    const before = text.slice(Math.max(0, at - anchor.prefix.length), at);
    const after = text.slice(at + anchor.exact.length, at + anchor.exact.length + anchor.suffix.length);
    const score =
      commonSuffixLen(before, anchor.prefix) +
      commonPrefixLen(after, anchor.suffix) -
      Math.min(24, Math.abs(at - anchor.start) / 40);
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
  }
  return best;
}

function rangeForSpan(idx: TextIndex, from: number, to: number): Range | null {
  let a = from;
  let b = to;
  while (a < b && idx.map[a]?.synthetic) a += 1;
  while (b > a && idx.map[b - 1]?.synthetic) b -= 1;
  const head = idx.map[a];
  const tail = idx.map[b - 1];
  if (!head || !tail) return null;
  const range = document.createRange();
  try {
    range.setStart(head.node, Math.min(head.offset, head.node.length));
    range.setEnd(tail.node, Math.min(tail.offset + 1, tail.node.length));
  } catch {
    return null;
  }
  return range;
}

/**
 * Find an anchor's passage in an already-built index. `null` means the quote is
 * gone — the comment is orphaned, not misplaced.
 */
export function resolveIn(idx: TextIndex, anchor: TextAnchor): Range | null {
  if (!anchor.exact || !idx.text) return null;
  const at = bestOccurrence(idx.text, anchor);
  if (at < 0) return null;
  return rangeForSpan(idx, at, at + anchor.exact.length);
}

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The boxes a passage occupies, in `container`'s coordinate space — one per line
 * it wraps onto. Sub-pixel slivers are dropped: a selection that ends exactly at
 * a line break reports a zero-width box on the next line, which paints as a
 * stray tick in the margin.
 */
export function rectsForRange(range: Range, container: HTMLElement): HighlightRect[] {
  const base = container.getBoundingClientRect();
  const out: HighlightRect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue;
    const rect = {
      top: r.top - base.top + container.scrollTop,
      left: r.left - base.left + container.scrollLeft,
      width: r.width,
      height: r.height,
    };
    // getClientRects reports a box per inline element, so a passage crossing a
    // <b> comes back as overlapping neighbours on the same line.
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.top - rect.top) < 1 &&
      Math.abs(prev.height - rect.height) < 1 &&
      rect.left <= prev.left + prev.width + 1
    ) {
      prev.width = Math.max(prev.width, rect.left + rect.width - prev.left);
      continue;
    }
    out.push(rect);
  }
  return out;
}
