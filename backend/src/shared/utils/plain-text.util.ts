/**
 * A comment body is rich HTML — a mention is a `<span class="rte-mention">`, a
 * line break is a literal `<br>`. Anywhere a body is shown as *text* rather than
 * rendered (the inbox list, a Lark/Telegram webhook), flatten it here; otherwise
 * the markup arrives verbatim and reads as `&nbsp;<br><span class="rte-mention"…`.
 */
export function plainText(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    // `&amp;` last, or `&amp;lt;` would decode all the way down to `<`.
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Like {@link plainText}, but block boundaries survive as line breaks.
 *
 * `plainText` collapses all whitespace, which is right for a one-line preview and
 * wrong for anywhere the text is read as a document — pushing a description to
 * ClickUp, say, where a three-paragraph repro arriving as one run-on sentence is
 * strictly worse than what the person wrote. Paragraphs and headings become blank
 * lines, list items and `<br>` become single ones, and runs of more than two
 * blank lines are squeezed so an editor's empty paragraphs don't become chasms.
 */
export function plainTextBlocks(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(li|tr)>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|blockquote|ul|ol|table)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    // Trailing spaces first, so a line of nothing but spaces counts as blank.
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * `plainText` capped to `max` characters, ellipsised when it had to cut. Strip
 * *then* measure: a slice of raw HTML can cut a tag in half, and markup must not
 * spend the budget meant for what the person actually wrote.
 */
export function plainSnippet(html: string, max: number): string {
  const text = plainText(html);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
