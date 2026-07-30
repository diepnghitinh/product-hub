// The `@` picker for the editor — type `@`, pick a person, get the same
// `rte-mention` chip the `/` menu inserts, so a mention is one thing across the
// product no matter where it was written: any block, and any table cell.
//
// Its own class rather than another mode of `SlashMenu`: this one only does
// mentions, on a trigger of its own, and is only bound when the editor is handed
// people to mention.
//
// The popup is appended to `document.body`, for the reasons the slash menu
// documents: a node inside a block is read back as block *content* and would be
// saved into the document, and `.report-workspace` redefines the colour tokens
// a popup rendered inside it would inherit.
import { initials } from '@/lib/format';
import type { SlashPerson } from './SlashMenu';

/**
 * `@` counts at the start of a block or after a space — never mid-word, so an
 * email address someone typed doesn't open a people picker on its domain.
 */
const AT = /(?:^|[\s ])@([^\s ]*)$/;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface MentionMenuConfig {
  /**
   * A getter, not an array: the editor is built on mount, which is before the
   * workspace's member list has come back.
   */
  people: () => SlashPerson[];
  /** Tell the editor the document changed, so it saves. */
  onChange?: () => void;
}

export class MentionMenu {
  private readonly config: MentionMenuConfig;
  private root: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  /** The block the menu was opened from. */
  private host: HTMLElement | null = null;
  /** The text node holding the `@`, and where in it that `@` sits. */
  private anchorNode: Text | null = null;
  private anchorStart = 0;
  private query = '';
  private items: SlashPerson[] = [];
  private active = 0;
  /** Set while `insert()` rewrites the block, so our own edits don't re-trigger. */
  private busy = false;
  private unbind: (() => void) | null = null;

  constructor(config: MentionMenuConfig) {
    this.config = config;
  }

  /**
   * Keys are taken in the capture phase: Editor.js binds Enter on the block to
   * split it, so capturing above that is what lets an open menu take Enter as
   * "insert the highlighted person" first.
   */
  bind(holder: HTMLElement) {
    this.unbind?.();
    const onInput = () => {
      if (!this.busy) this.refresh();
    };
    const onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const onPointerDown = (e: PointerEvent) => {
      if (this.root && !this.root.contains(e.target as Node)) this.close();
    };
    holder.addEventListener('input', onInput);
    holder.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    this.unbind = () => {
      holder.removeEventListener('input', onInput);
      holder.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }

  destroy() {
    this.unbind?.();
    this.unbind = null;
    this.close();
  }

  // ── Tracking the `@query` in the block ─────────────────────────────────────

  /** Re-read the caret. Opens, filters, or closes the menu to match what's typed. */
  private refresh() {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !sel.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE) return this.close();
    const parent = node.parentElement as HTMLElement | null;
    // A table cell is a mention host like any other line. Its `/` menu does offer
    // people, but nobody types `/` to mention someone — `@` is the gesture, and it
    // used to do nothing at all inside a table.
    const host =
      parent?.closest<HTMLElement>('.tc-cell') ?? parent?.closest<HTMLElement>('.ce-block');
    if (!host || parent?.closest('input, textarea')) return this.close();

    const before = (node.textContent ?? '').slice(0, sel.anchorOffset);
    const match = before.match(AT);
    if (!match) return this.close();

    this.host = host;
    this.anchorNode = node as Text;
    this.anchorStart = before.length - match[1].length - 1;
    this.query = match[1];
    this.open();
  }

  // ── The popup ──────────────────────────────────────────────────────────────

  private open() {
    // Nothing to offer: leave the typing alone rather than showing an empty box
    // that would swallow the next Enter. `@` on its own is just text.
    if (!this.matches().length) return this.close();
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.className = 'rte-slash';
      this.root.setAttribute('role', 'listbox');
      this.root.setAttribute('contenteditable', 'false');
      // Keep the caret in the block: a pointerdown landing on the menu must not
      // move focus, or the range we're about to write into stops existing.
      this.root.addEventListener('pointerdown', (e) => e.preventDefault());
      document.body.appendChild(this.root);
      this.active = 0;
    }
    this.render();
    this.position();
  }

  private close() {
    this.root?.remove();
    this.root = null;
    this.listEl = null;
    this.active = 0;
  }

  private get isOpen() {
    return !!this.root;
  }

  private matches(): SlashPerson[] {
    const q = this.query.toLowerCase();
    const people = this.config.people();
    if (!q) return people.slice(0, 8);
    return people
      .filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q))
      .slice(0, 8);
  }

  /** Anchor to the `@` itself — a collapsed range has no rect in every browser. */
  private position() {
    const root = this.root;
    const node = this.anchorNode;
    if (!root || !node) return;
    const range = document.createRange();
    range.setStart(node, this.anchorStart);
    range.setEnd(node, Math.min(this.anchorStart + 1, node.length));
    const caret = range.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(caret.left, window.innerWidth - box.width - margin));
    // Flip above the caret when there isn't room below it.
    const below = caret.bottom + 6;
    const top = below + box.height > window.innerHeight - margin ? caret.top - box.height - 6 : below;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  private render() {
    const root = this.root;
    if (!root) return;
    root.innerHTML = '';
    this.items = this.matches();
    if (this.active >= this.items.length) this.active = Math.max(0, this.items.length - 1);

    const list = document.createElement('div');
    list.className = 'rte-slash__list';
    this.listEl = list;
    this.items.forEach((person, i) => {
      const el = document.createElement('div');
      el.className = `rte-slash__item${i === this.active ? ' is-active' : ''}`;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(i === this.active));
      el.innerHTML =
        `<span class="rte-slash__icon"><span class="rte-slash__avatar">${escapeHtml(
          initials(person.name, person.email),
        )}</span></span><span class="rte-slash__label"></span>`;
      (el.querySelector('.rte-slash__label') as HTMLElement).textContent = person.name;
      el.addEventListener('mouseenter', () => this.setActive(i));
      el.addEventListener('click', () => this.insert(person));
      list.appendChild(el);
    });
    root.appendChild(list);
    this.position();
  }

  private setActive(i: number) {
    this.active = i;
    this.listEl?.querySelectorAll('.rte-slash__item').forEach((el, n) => {
      el.classList.toggle('is-active', n === i);
      el.setAttribute('aria-selected', String(n === i));
    });
  }

  private onKeyDown(e: KeyboardEvent) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return this.close();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === 'ArrowDown' ? this.active + 1 : this.active - 1;
      return this.setActive((next + this.items.length) % this.items.length);
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const person = this.items[this.active];
      if (!person) return;
      e.preventDefault();
      e.stopPropagation();
      this.insert(person);
    }
  }

  /** Swap the typed `@query` for the person's chip, caret after it. */
  private insert(person: SlashPerson) {
    const node = this.anchorNode;
    const block = this.host;
    if (!node || !block) return this.close();

    this.busy = true;
    const range = document.createRange();
    range.setStart(node, this.anchorStart);
    range.setEnd(node, Math.min(this.anchorStart + 1 + this.query.length, node.length));
    range.deleteContents();
    const fragment = range.createContextualFragment(
      `<span class="rte-mention" data-user-id="${escapeHtml(person.id)}">@${escapeHtml(
        person.name,
      )}</span>&nbsp;`,
    );
    const last = fragment.lastChild;
    range.insertNode(fragment);

    const sel = window.getSelection();
    const next = document.createRange();
    if (last) {
      next.setStartAfter(last);
      next.collapse(true);
    }
    sel?.removeAllRanges();
    sel?.addRange(next);

    this.close();
    this.busy = false;
    this.config.onChange?.();
  }
}
