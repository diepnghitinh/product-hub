// Adds a hover "copy" button to code blocks, both in the read-only view
// (`<pre><code>…</code></pre>` produced by lib/editorjs.ts) and inside the
// Editor.js editor (`.ce-code` wrappers around a <textarea>). Pure DOM so it
// can run against dangerouslySetInnerHTML content and the editor alike.
// Ported from old-report/lib/enhanceCodeBlocks.ts.

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const RESET_MS = 1600;

function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for non-secure contexts where the async clipboard API is absent.
  return new Promise<void>((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('copy command failed'));
    } catch (err) {
      reject(err);
    }
  });
}

function buildCopyButton(getText: () => string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'code-copy-btn';
  btn.title = 'Copy';
  btn.setAttribute('aria-label', 'Copy code');
  // Editor.js ignores DOM changes inside mutation-free elements, so swapping
  // the icon never triggers a phantom save while editing.
  btn.setAttribute('data-mutation-free', 'true');
  btn.innerHTML = COPY_ICON;

  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const flash = () => {
    btn.classList.add('is-copied');
    btn.innerHTML = CHECK_ICON;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      btn.classList.remove('is-copied');
      btn.innerHTML = COPY_ICON;
    }, RESET_MS);
  };

  // Keep the click from blurring/selecting the surrounding editor block.
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyText(getText())
      .then(flash)
      .catch(() => {
        /* clipboard blocked — leave the button untouched */
      });
  });
  return btn;
}

// Size a code textarea to its content height and keep it fitted as the user
// types, so it never shows an inner vertical scrollbar.
function autoGrowTextarea(textarea: HTMLTextAreaElement): void {
  const fit = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  fit();
  textarea.addEventListener('input', fit);
}

/**
 * Decorate every not-yet-decorated code block found under `root` with a copy
 * button. Idempotent: blocks are tagged with `data-copy-ready` so repeated
 * calls (e.g. from a MutationObserver) are cheap no-ops.
 */
export function enhanceCodeBlocks(root: ParentNode | null | undefined): void {
  if (!root || typeof document === 'undefined') return;

  // Read view: <pre><code>…</code></pre>. Wrap the <pre> so the button can sit
  // in a non-scrolling container and stay put when the code scrolls sideways.
  root.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    if (pre.dataset.copyReady || pre.closest('.ce-code')) return;
    const parent = pre.parentNode;
    if (!parent) return;
    pre.dataset.copyReady = '1';
    const wrap = document.createElement('div');
    wrap.className = 'code-copy-wrap';
    parent.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    wrap.appendChild(buildCopyButton(() => (pre.querySelector('code') ?? pre).textContent ?? ''));
  });

  // Editor: Editor.js code blocks render a <textarea> inside `.ce-code`.
  root.querySelectorAll<HTMLElement>('.ce-code').forEach((block) => {
    if (block.dataset.copyReady) return;
    const textarea = block.querySelector('textarea');
    if (!textarea) return;
    block.dataset.copyReady = '1';
    block.classList.add('code-copy-host');
    block.appendChild(buildCopyButton(() => textarea.value));
    autoGrowTextarea(textarea);
  });
}
