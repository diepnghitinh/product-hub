import { AggregateRoot, UniqueEntityID } from '@core/domain';
import { Result } from '@shared/logic/result';
import { Guard } from '@shared/logic/guard';
import { DocPageVersionProps } from './doc-page-version.props';

const MAX_LABEL_LENGTH = 120;

/**
 * A saved point in a page's life: its title and body, frozen. Versions are
 * append-only — nothing edits one, and restoring copies a version *back onto*
 * the page rather than moving the page's pointer. That keeps the page the single
 * source of truth for "what it says now" and leaves history a plain log.
 */
export class DocPageVersionEntity extends AggregateRoot<DocPageVersionProps> {
  private constructor(props: DocPageVersionProps, id?: UniqueEntityID) {
    super(props, id);
  }

  static create(
    props: {
      tenantId: string;
      docId: string;
      pageId: string;
      title: string;
      content?: string;
      label?: string;
      createdBy?: string;
      createdByName?: string;
      createdAt?: Date;
    },
    id?: UniqueEntityID,
  ): Result<DocPageVersionEntity> {
    const tenantGuard = Guard.againstNullOrUndefined(props.tenantId, 'tenantId');
    if (!tenantGuard.succeeded) return Result.fail(tenantGuard.message);
    const docGuard = Guard.againstEmptyString(props.docId, 'docId');
    if (!docGuard.succeeded) return Result.fail(docGuard.message);
    const pageGuard = Guard.againstEmptyString(props.pageId, 'pageId');
    if (!pageGuard.succeeded) return Result.fail(pageGuard.message);

    return Result.ok(
      new DocPageVersionEntity(
        {
          id: id || new UniqueEntityID(),
          tenantId: props.tenantId,
          docId: props.docId,
          pageId: props.pageId,
          // An untitled page can still be versioned, so no empty-string guard here.
          title: props.title ?? '',
          content: props.content ?? '',
          label: (props.label ?? '').trim().slice(0, MAX_LABEL_LENGTH),
          createdBy: props.createdBy || '',
          createdByName: props.createdByName || '',
          createdAt: props.createdAt || new Date(),
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
  get pageId(): string {
    return this.props.pageId;
  }
  get title(): string {
    return this.props.title;
  }
  get content(): string {
    return this.props.content;
  }
  get label(): string {
    return this.props.label;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdByName(): string {
    return this.props.createdByName;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
