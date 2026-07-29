// Ctrl+B / Ctrl+I / Ctrl+U — the formatting shortcuts, on the key people
// actually press.
//
// On a Mac the editor only ever heard ⌘. Editor.js reads its own `CMD+B` as
// either modifier, so bold and italic happened to work with Ctrl; **underline
// never did** — `@editorjs/underline` ships no shortcut at all, so ⌘+U was
// Chrome's own contenteditable command and Ctrl+U was macOS's "delete to start of
// line", which quietly ate the line instead of underlining it.
//
// So the three are bound here together rather than left to three different
// owners: the same gesture, the same result, and nothing destructive left
// wired to a formatting key.
import { toggleStrikethrough } from './StrikeTool';

/** `execCommand` is what Editor.js's own bold/italic tools use — same markup. */
const COMMANDS: Record<string, string> = { b: 'bold', i: 'italic', u: 'underline' };

/**
 * Bind the inline formatting keys inside `holder`. Returns an unbind function.
 * `onChange` tells the editor the document moved, since a command run this way
 * isn't one of its own.
 */
export function bindInlineShortcuts(holder: HTMLElement, onChange: () => void): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    // Ctrl only. ⌘ already reaches the tools, and taking it here would toggle
    // the same mark twice — on, then straight back off.
    if (!e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    // A code block is a real `<textarea>`, where Ctrl+U is the shell-style
    // "delete to start of line" people use on purpose.
    if (!target || target.closest('input, textarea')) return;
    if (!target.closest('[contenteditable="true"]')) return;

    const key = e.key.toLowerCase();
    if (e.shiftKey) {
      if (key !== 'x') return;
      e.preventDefault();
      e.stopPropagation();
      toggleStrikethrough();
      onChange();
      return;
    }
    const command = COMMANDS[key];
    if (!command) return;
    e.preventDefault();
    e.stopPropagation();
    document.execCommand(command);
    onChange();
  };

  // Capture: Editor.js binds its shortcuts on the redactor inside this holder,
  // so taking the key one level above is what lets these run first.
  holder.addEventListener('keydown', onKeyDown, true);
  return () => holder.removeEventListener('keydown', onKeyDown, true);
}
