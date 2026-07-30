// Mermaid diagrams, rendered on demand. The library is ~500KB, so it is loaded
// with a dynamic import the first time a diagram actually needs drawing —
// a page with no diagram never pays for it.
import { decodeEntities } from '@/lib/editorjs';

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

let loader: Promise<MermaidApi> | null = null;

/**
 * The current app theme, so a diagram isn't black-on-black in dark mode.
 *
 * Read off `data-theme`, which is where `ThemeProvider` puts it and what
 * `tailwind.config.cjs` binds the `dark:` variant to. There is no `.dark` class
 * on this app's `<html>` — looking for one is how every diagram ended up drawn
 * in the light palette, including on a dark page.
 */
function currentTheme(): 'dark' | 'default' {
  return typeof document !== 'undefined' &&
    document.documentElement.dataset['theme'] === 'dark'
    ? 'dark'
    : 'default';
}

async function load(): Promise<MermaidApi> {
  if (!loader) {
    loader = import('mermaid').then((m) => (m.default ?? m) as unknown as MermaidApi);
  }
  return loader;
}

/**
 * Markdown puts mermaid inside a fenced block. People paste that whole fence, so
 * accept it and hand back just the diagram — otherwise the ``` lines are parsed
 * as diagram source and every paste is a syntax error.
 */
export function stripMermaidFence(source: string): string {
  const fenced = source.trim().match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n?```$/i);
  return (fenced ? fenced[1] : source).trim();
}

let seq = 0;

/**
 * Draw one diagram. Resolves to SVG markup, or rejects with the parse error
 * mermaid produced — callers show that text, since a broken diagram is usually
 * a typo the author can fix on the spot.
 *
 * The source is decoded first. `-->` that has been through an HTML round-trip
 * comes back as `--&gt;`, and mermaid reads that as a lexical error rather than
 * an arrow — so a diagram that was saved before the escaping was fixed still
 * draws, and is written back clean the next time its page is saved.
 */
export async function renderMermaid(source: string): Promise<string> {
  const code = decodeEntities(stripMermaidFence(source));
  if (!code) throw new Error('Empty diagram');
  const mermaid = await load();
  // Re-initialized per render: it's cheap, and it's the only way a diagram
  // drawn before a theme switch picks up the new one.
  mermaid.initialize({
    startOnLoad: false,
    theme: currentTheme(),
    // Diagram source is workspace content, but it's still user input — keep
    // mermaid's own sanitizer on so a label can't smuggle in script.
    securityLevel: 'strict',
    fontFamily: 'inherit',
  });
  // Ids must be unique per document or mermaid's <defs> collide between diagrams.
  const { svg } = await mermaid.render(`mermaid-${Date.now().toString(36)}-${seq++}`, code);
  return svg;
}

/**
 * Draw every mermaid block inside `root` that hasn't been drawn yet. Shared by
 * the read-only renderer and the editor's preview so both produce the same
 * picture from the same markup.
 *
 * A block is `<pre class="mermaid-source"><code>…</code></pre>` — the source
 * stays in the DOM (that's what round-trips back to Editor.js) and the SVG is
 * appended beside it, with CSS hiding whichever one shouldn't show.
 */
export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid-source'));
  await Promise.all(
    blocks.map(async (pre) => {
      const source = pre.textContent ?? '';
      // The <figure>, not the <pre>'s immediate parent — other passes over this
      // DOM may have wrapped the <pre>, and the SVG belongs beside the source.
      const host = pre.closest<HTMLElement>('figure.mermaid-block') ?? pre.parentElement;
      if (!host) return;
      // Already drawn from this exact source — nothing to redo.
      if (host.dataset.mermaidDrawn === source) return;
      // Claimed *before* the first await, not after it. Drawing starts with a
      // ~500KB dynamic import, and any second pass over the same DOM inside that
      // window — a re-render, or React's double-invoked effects — would sail
      // past the check above and append a second copy of the picture.
      host.dataset.mermaidDrawn = source;

      const output = document.createElement('div');
      output.className = 'mermaid-render';
      try {
        output.innerHTML = await renderMermaid(source);
        host.dataset.mermaidError = '';
      } catch (e) {
        output.textContent = (e as Error).message || 'Could not draw this diagram';
        host.dataset.mermaidError = 'true';
      }
      // Swapped only once the new picture exists, so a redraw doesn't blink.
      host.querySelector('.mermaid-render')?.remove();
      host.appendChild(output);
    }),
  );
}
