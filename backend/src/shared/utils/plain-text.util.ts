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
 * `plainText` capped to `max` characters, ellipsised when it had to cut. Strip
 * *then* measure: a slice of raw HTML can cut a tag in half, and markup must not
 * spend the budget meant for what the person actually wrote.
 */
export function plainSnippet(html: string, max: number): string {
  const text = plainText(html);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
