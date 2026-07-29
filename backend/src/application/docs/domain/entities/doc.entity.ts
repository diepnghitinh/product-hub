import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { DocProps } from './doc.props';

/** Room for a shelf of tags without letting one doc become the taxonomy. */
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

/**
 * A Doc is the container — a workspace-level document whose content lives in its
 * pages (`DocPageEntity`), which nest into a tree. Kept deliberately thin: the doc
 * holds identity, the cover, its tags and the share link; every word of writing
 * is a page.
 */
export class DocEntity extends AggregateRoot<DocProps> {
  private constructor(props: DocProps, id?: UniqueEntityID) {
    super(props, id);
  }

  /**
   * Tags are typed by hand, so they arrive dirty: padded, blank, or the same
   * word in three casings. Normalize here rather than at the edge — every write
   * path (create, update, import) goes through the entity.
   */
  private static normalizeTags(tags: string[] | undefined): string[] {
    if (!tags) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
      const tag = (raw ?? '').trim().slice(0, MAX_TAG_LENGTH);
      if (!tag) continue;
      const key = tag.toLowerCase();
      // First spelling wins, so "Discovery" doesn't flip to "discovery" later.
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
      if (out.length >= MAX_TAGS) break;
    }
    return out;
  }

  static create(
    props: {
      tenantId: string;
      ref?: string;
      title: string;
      icon?: string;
      color?: string | null;
      coverUrl?: string;
      tags?: string[];
      createdBy?: string;
      createdByName?: string;
      publicEnabled?: boolean;
      publicToken?: string | null;
      createdAt?: Date;
      updatedAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<DocEntity> {
    const guard = Guard.againstNullOrUndefined(props.tenantId, 'tenantId');
    if (!guard.succeeded) return Result.fail(guard.message);
    const titleGuard = Guard.againstEmptyString(props.title, 'title');
    if (!titleGuard.succeeded) return Result.fail(titleGuard.message);

    const now = new Date();
    return Result.ok(
      new DocEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          ref: props.ref?.trim().toUpperCase() || '',
          title: props.title.trim(),
          icon: props.icon?.trim() || '',
          color: props.color ?? null,
          coverUrl: props.coverUrl?.trim() || '',
          tags: this.normalizeTags(props.tags),
          createdBy: props.createdBy || '',
          createdByName: props.createdByName || '',
          publicEnabled: props.publicEnabled ?? false,
          publicToken: props.publicToken ?? null,
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
  get ref(): string {
    return this.props.ref;
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
  get tags(): string[] {
    return this.props.tags;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdByName(): string {
    return this.props.createdByName;
  }
  get publicEnabled(): boolean {
    return this.props.publicEnabled;
  }
  get publicToken(): string | null {
    return this.props.publicToken;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  applyMeta(meta: {
    title?: string;
    icon?: string;
    color?: string | null;
    coverUrl?: string;
    tags?: string[];
  }): void {
    if (meta.title !== undefined) {
      if (!meta.title.trim()) throw new Error('title cannot be empty');
      this.props.title = meta.title.trim();
    }
    if (meta.icon !== undefined) this.props.icon = meta.icon.trim();
    if (meta.color !== undefined) this.props.color = meta.color;
    if (meta.coverUrl !== undefined) this.props.coverUrl = meta.coverUrl.trim();
    // Sent whole, replacing the list — there's no add/remove endpoint, the
    // editor always knows the full set.
    if (meta.tags !== undefined) this.props.tags = DocEntity.normalizeTags(meta.tags);
    this.touch();
  }

  /** Give a legacy doc its ref. Only ever set once — a ref that moved would
   *  break every link already handed out, so an existing one is kept. */
  assignRef(ref: string): void {
    if (this.props.ref) return;
    this.props.ref = ref.trim().toUpperCase();
  }

  enableSharing(token: string): void {
    this.props.publicEnabled = true;
    this.props.publicToken = token;
    this.touch();
  }

  disableSharing(): void {
    this.props.publicEnabled = false;
    this.props.publicToken = null;
    this.touch();
  }

  /** Bumped when a page changes too, so the hub can sort docs by real activity. */
  touch(): void {
    this.props.updatedAt = new Date();
  }
}
