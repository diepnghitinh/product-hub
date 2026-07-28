import { DocFontSize, DocFontStyle, DocPageWidth } from '@/types/enums';
import type { DocPageDto } from '@/types/dto';

/**
 * Page Styles for one doc page — the eight fields the panel writes, lifted out
 * of `DocPageDto` so the editor, the panel and the public view all name the same
 * thing. The API stores them flat on the page; this is only a view of them.
 */
export interface DocPageStyle {
  fontStyle: DocFontStyle;
  fontSize: DocFontSize;
  pageWidth: DocPageWidth;
  showCover: boolean;
  showTitle: boolean;
  showUpdated: boolean;
  showLinks: boolean;
  showAttachments: boolean;
}

/** Mirrors the backend's `DEFAULT_PAGE_STYLE`. */
export const PAGE_STYLE_DEFAULTS: DocPageStyle = {
  fontStyle: DocFontStyle.SYSTEM,
  fontSize: DocFontSize.DEFAULT,
  pageWidth: DocPageWidth.DEFAULT,
  showCover: true,
  showTitle: true,
  showUpdated: true,
  showLinks: true,
  showAttachments: true,
};

/** Just the three typography fields — what "apply to all pages" copies over. */
export type DocTypography = Pick<DocPageStyle, 'fontStyle' | 'fontSize' | 'pageWidth'>;

/**
 * The style of a page as loaded. Falls back field by field rather than all at
 * once: a page fetched from an older API (or a cached response written before
 * this shipped) can be missing some fields and still render the rest.
 */
export function pageStyleOf(page?: Partial<DocPageDto> | null): DocPageStyle {
  return {
    fontStyle: page?.fontStyle ?? PAGE_STYLE_DEFAULTS.fontStyle,
    fontSize: page?.fontSize ?? PAGE_STYLE_DEFAULTS.fontSize,
    pageWidth: page?.pageWidth ?? PAGE_STYLE_DEFAULTS.pageWidth,
    showCover: page?.showCover ?? PAGE_STYLE_DEFAULTS.showCover,
    showTitle: page?.showTitle ?? PAGE_STYLE_DEFAULTS.showTitle,
    showUpdated: page?.showUpdated ?? PAGE_STYLE_DEFAULTS.showUpdated,
    showLinks: page?.showLinks ?? PAGE_STYLE_DEFAULTS.showLinks,
    showAttachments: page?.showAttachments ?? PAGE_STYLE_DEFAULTS.showAttachments,
  };
}

/**
 * What to put on the element wrapping a whole page — heading, byline and body
 * together, so the face and size are one decision rather than three.
 *
 * The font and size ride as data attributes read by `.doc-typography`
 * (rich-text-editor.css) instead of Tailwind classes, because the editor sets
 * its own body font-size in CSS and a utility class can't reach inside it — the
 * stylesheet hands both a custom property they agree on.
 */
export function typographyAttrs(style: DocTypography) {
  return {
    className: 'doc-typography',
    'data-font': style.fontStyle,
    'data-size': style.fontSize,
  } as const;
}

/** The measure of the page column. */
export function widthClass(width: DocPageWidth): string {
  return width === DocPageWidth.FULL ? 'max-w-none' : 'max-w-3xl';
}
