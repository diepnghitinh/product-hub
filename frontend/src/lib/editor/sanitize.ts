import type { SanitizerConfig } from '@editorjs/editorjs';

/**
 * The inline markup a text field survives a save with.
 *
 * Editor.js sanitizes every string in a block's data on every save, against a
 * whitelist the tool declares. A tool that declares nothing falls back to the
 * core defaults — enough for bold and links, but a mention chip or an inline
 * code span would be stripped, and the author would watch their content vanish
 * as they typed. So each text-bearing tool lists what it keeps, and they all
 * list the *same* things from here: what bold means shouldn't depend on which
 * kind of block you happened to type it in.
 *
 * This is also the security boundary for pasted HTML — nothing outside the list
 * makes it into a stored document.
 */
export const INLINE_SANITIZE: SanitizerConfig = {
  br: true,
  b: {},
  strong: {},
  i: {},
  em: {},
  u: {},
  // Strikethrough (lib/editor/StrikeTool). `<s>` and nothing else: the tag is
  // the format here, so a pasted `<strike>` or `<del>` is not a second spelling
  // to keep alive through every converter.
  s: {},
  mark: {},
  // The inline-code tool's chip, and the class it's recognised by.
  code: { class: true },
  a: { href: true, target: true, rel: true },
  // `@` mention and date chips (lib/editor/MentionMenu, SlashMenu).
  span: { class: true, 'data-user-id': true, 'data-date': true },
};
