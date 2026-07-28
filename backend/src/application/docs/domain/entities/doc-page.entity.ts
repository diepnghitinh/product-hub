import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import {
  DEFAULT_PAGE_STYLE,
  DocFontSize,
  DocFontStyle,
  DocPageWidth,
} from '../enums/doc.enums';
import { DocAttachment } from '../types/doc-attachment.type';
import { DocLinkRef } from '../types/doc-link.type';
import { DocPageProps } from './doc-page.props';

/**
 * The keys that were actually given. Spreading a patch straight over
 * `DEFAULT_PAGE_STYLE` would let an explicit `undefined` — which is what a page
 * stored before Page Styles existed hands back — blank the default out again.
 */
function definedOnly<T extends object>(patch?: T): Partial<T> {
  if (!patch) return {};
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** The Page Styles half of an edit — every field optional, every one a patch. */
export interface DocPageStyleEdit {
  fontStyle?: DocFontStyle;
  fontSize?: DocFontSize;
  pageWidth?: DocPageWidth;
  showCover?: boolean;
  showTitle?: boolean;
  showUpdated?: boolean;
  showLinks?: boolean;
  showAttachments?: boolean;
}

/**
 * One page of a doc — the thing you actually write in. Pages form a tree inside
 * their doc via `parentId` ('' = top level) and are ordered among their siblings
 * by `order`, so the left rail can be rendered from a single flat fetch.
 */
export class DocPageEntity extends AggregateRoot<DocPageProps> {
  private constructor(props: DocPageProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      docId: string;
      parentId?: string;
      title: string;
      icon?: string;
      color?: string | null;
      coverUrl?: string;
      content?: string;
      links?: DocLinkRef[];
      attachments?: DocAttachment[];
      style?: DocPageStyleEdit;
      order?: number;
      createdBy?: string;
      updatedBy?: string;
      updatedByName?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<DocPageEntity> {
    const tenantGuard = Guard.againstNullOrUndefined(props.tenantId, 'tenantId');
    if (!tenantGuard.succeeded) return Result.fail(tenantGuard.message);
    const docGuard = Guard.againstEmptyString(props.docId, 'docId');
    if (!docGuard.succeeded) return Result.fail(docGuard.message);
    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new DocPageEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          docId: props.docId,
          parentId: props.parentId || '',
          title: props.title.trim(),
          icon: props.icon?.trim() || '',
          color: props.color ?? null,
          coverUrl: props.coverUrl?.trim() || '',
          content: props.content ?? '',
          links: props.links ?? [],
          attachments: props.attachments ?? [],
          ...DEFAULT_PAGE_STYLE,
          ...definedOnly(props.style),
          order: props.order ?? 0,
          createdBy: props.createdBy || '',
          updatedBy: props.updatedBy || props.createdBy || '',
          updatedByName: props.updatedByName || '',
          createdAt: props.createdAt || now,
          updatedAt: props.updatedAt || now,
        },
        id,
      ),
    );
  }

  get id(): UniqueEntityID {
    return this._id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get docId(): string {
    return this.props.docId;
  }
  get parentId(): string {
    return this.props.parentId;
  }
  get title(): string {
    return this.props.title;
  }
  get icon(): string {
    return this.props.icon;
  }
  get color(): string | null {
    return this.props.color;
  }
  get coverUrl(): string {
    return this.props.coverUrl;
  }
  get content(): string {
    return this.props.content;
  }
  get links(): DocLinkRef[] {
    return this.props.links;
  }
  get attachments(): DocAttachment[] {
    // Pages stored before attachments existed have no array at all.
    return this.props.attachments ?? [];
  }
  get fontStyle(): DocFontStyle {
    return this.props.fontStyle ?? DEFAULT_PAGE_STYLE.fontStyle;
  }
  get fontSize(): DocFontSize {
    return this.props.fontSize ?? DEFAULT_PAGE_STYLE.fontSize;
  }
  get pageWidth(): DocPageWidth {
    return this.props.pageWidth ?? DEFAULT_PAGE_STYLE.pageWidth;
  }
  /** The header/section switches. `?? true` so a page stored before Page Styles
   *  shows everything, which is exactly how it rendered yesterday. */
  get showCover(): boolean {
    return this.props.showCover ?? DEFAULT_PAGE_STYLE.showCover;
  }
  get showTitle(): boolean {
    return this.props.showTitle ?? DEFAULT_PAGE_STYLE.showTitle;
  }
  get showUpdated(): boolean {
    return this.props.showUpdated ?? DEFAULT_PAGE_STYLE.showUpdated;
  }
  get showLinks(): boolean {
    return this.props.showLinks ?? DEFAULT_PAGE_STYLE.showLinks;
  }
  get showAttachments(): boolean {
    return this.props.showAttachments ?? DEFAULT_PAGE_STYLE.showAttachments;
  }
  get order(): number {
    return this.props.order;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get updatedByName(): string {
    return this.props.updatedByName;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  applyEdit(
    edit: {
      title?: string;
      icon?: string;
      color?: string | null;
      coverUrl?: string;
      content?: string;
      links?: DocLinkRef[];
      attachments?: DocAttachment[];
      style?: DocPageStyleEdit;
    },
    editor: { userId: string; name: string },
  ): void {
    if (edit.title !== undefined) {
      if (!edit.title.trim()) throw new Error('title cannot be empty');
      this.props.title = edit.title.trim();
    }
    if (edit.icon !== undefined) this.props.icon = edit.icon.trim();
    if (edit.color !== undefined) this.props.color = edit.color;
    if (edit.coverUrl !== undefined) this.props.coverUrl = edit.coverUrl.trim();
    if (edit.content !== undefined) this.props.content = edit.content;
    if (edit.links !== undefined) this.props.links = edit.links;
    if (edit.attachments !== undefined) this.props.attachments = edit.attachments;
    // Page Styles arrive as a partial patch — one switch at a time, from a panel
    // where the other seven aren't in play.
    Object.assign(this.props, definedOnly(edit.style));
    this.props.updatedBy = editor.userId;
    this.props.updatedByName = editor.name;
    this.touch();
  }

  /** Reparent + reposition in one step — what a drag in the page tree produces. */
  moveTo(parentId: string, order: number): void {
    this.props.parentId = parentId;
    this.props.order = order;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
