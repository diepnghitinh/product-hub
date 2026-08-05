import { useRef, useState, type DragEvent } from 'react';
import {
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Paperclip,
  Presentation,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { MediaUploader } from '@/components/MediaUploader';
import { FilePreviewDialog } from '@/components/FilePreviewDialog';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { formatFileSize } from '@/lib/format';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  canPreview,
  downloadFile,
  safeFileUrl,
} from '@/lib/filePreview';
import { useUploadQueue } from '@/features/uploads/useUploadQueue';
import type { AttachedFile } from '@/types/dto';

interface AttachmentsRowProps {
  items: AttachedFile[];
  /** Read-only when false: chips still open and download, nothing can be added or removed. */
  canWrite: boolean;
  /** The whole list after the change — every caller saves it as one field. */
  onChange?: (next: AttachedFile[]) => void;
  /**
   * Whether clicking a file opens it in the in-app viewer. Off where there's no
   * session to authenticate the byte-read with — the public doc view — so chips
   * there fall back to the plain storage link.
   */
  preview?: boolean;
  /** Renders an eyebrow heading above the row, matching the neighbouring sections. */
  title?: string;
  className?: string;
}

/**
 * The files attached to one record — a doc page, a backlog item, a task or a bug
 * — as a row of chips.
 *
 * One component for all of them on purpose: an attachment behaves the same
 * everywhere, and the moment it doesn't, three copies drift apart the way the
 * boards did. Uploads go straight to the workspace storage and the new list is
 * handed back for the caller to save — there's no staging step, because a doc
 * page has no Save button to stage anything for. Dropping files works too —
 * several at once — onto this section rather than the whole page, so it never
 * competes with the editor's own drag handling for images.
 */
export function AttachmentsRow({
  items,
  canWrite,
  onChange,
  preview = true,
  title,
  className,
}: AttachmentsRowProps) {
  const [dragging, setDragging] = useState(false);
  // Which file the viewer is showing; null when it's closed.
  const [viewing, setViewing] = useState<number | null>(null);
  // Depth counter so dragging across the chips inside doesn't flicker the hint.
  const depth = useRef(0);
  // A batch outlives the render that started it, so append to the list as it
  // stands *when it lands* — not the one captured when the files were picked.
  const latest = useRef(items);
  latest.current = items;
  const { pending, busy, add, cancel } = useUploadQueue((landed) =>
    onChange?.([...latest.current, ...landed]),
  );

  // Nothing attached and nothing to attach with — don't leave an empty rule
  // across the page (this is how it renders on the public view).
  if (!items.length && !canWrite) return null;

  function enqueue(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const room = MAX_ATTACHMENTS - items.length - pending.length;
    if (list.length > room) {
      toast.error(t('uploads.tooMany').replace('{n}', String(MAX_ATTACHMENTS)));
      if (room <= 0) return;
    }
    add(list.slice(0, room));
  }

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const dropHandlers = canWrite
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (hasFiles(e)) e.preventDefault();
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          // The whole drop at once — dragging four files in adds four.
          enqueue(e.dataTransfer.files);
        },
      }
    : {};

  const row = (
    <div
      // Only the drop target when there's no heading to hang it on; with one,
      // the section below takes the handlers so the target covers the label too.
      {...(title ? {} : dropHandlers)}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md transition-colors',
        !title &&
          dragging &&
          'bg-primary/5 outline-dashed outline-1 outline-offset-2 outline-primary/40',
        !title && className,
      )}
    >
      {items.map((file, i) => {
        const Glyph = glyphFor(file.contentType, file.name);
        const size = formatFileSize(file.size);
        const viewable = preview && canPreview(file);
        return (
          <span
            key={file.url}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs"
          >
            <Glyph className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {preview ? (
              // A button, not a link: both actions go through the API — the
              // viewer reads the bytes, the download names the file properly —
              // so there's no URL for this to navigate to.
              <button
                type="button"
                onClick={() => (viewable ? setViewing(i) : downloadFile(file))}
                title={`${file.name} — ${viewable ? t('uploads.preview') : t('uploads.download')}`}
                className="max-w-[180px] truncate font-medium text-foreground hover:text-primary sm:max-w-[220px]"
              >
                {file.name}
              </button>
            ) : (
              <a
                href={safeFileUrl(file.url)}
                target="_blank"
                rel="noopener noreferrer"
                download={file.name}
                title={file.name}
                className="max-w-[180px] truncate font-medium text-foreground hover:text-primary sm:max-w-[220px]"
              >
                {file.name}
              </a>
            )}
            {size && <span className="shrink-0 text-muted-foreground">{size}</span>}
            {/* Every chip gets the same anatomy — glyph · name · size · download ·
                remove — so a file with no preview doesn't read as one that can't
                be saved. Only where the name itself isn't already the download
                link (the session-less public view). */}
            {preview && (
              <button
                type="button"
                aria-label={t('uploads.download')}
                title={t('uploads.download')}
                onClick={() => downloadFile(file)}
                className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Download className="size-3" />
              </button>
            )}
            {canWrite ? (
              <button
                type="button"
                aria-label={t('uploads.removeFile')}
                title={t('uploads.removeFile')}
                onClick={() => onChange?.(items.filter((f) => f.url !== file.url))}
                className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : (
              <span className="w-1" aria-hidden />
            )}
          </span>
        );
      })}

      {/* In-flight files, in the same chip shape so the row doesn't reflow when
          one lands — the finished chip simply takes its place. */}
      {pending.map((file) => {
        const Glyph = glyphFor('', file.name);
        return (
          <span
            key={file.id}
            className="inline-flex max-w-full flex-col gap-1 rounded-md border border-dashed bg-muted/40 py-1 pl-2 pr-1 text-xs"
          >
            <span className="inline-flex items-center gap-1.5">
              <Glyph className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="max-w-[180px] truncate font-medium text-foreground sm:max-w-[220px]">
                {file.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {file.status === 'queued'
                  ? t('uploads.queued')
                  : file.status === 'finishing'
                    ? // The bytes are sent; the API is still writing them to
                      // storage, which the browser can't measure.
                      t('uploads.finishing')
                    : `${file.percent}%`}
              </span>
              <button
                type="button"
                aria-label={t('uploads.cancelUpload')}
                title={t('uploads.cancelUpload')}
                onClick={() => cancel(file.id)}
                className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
            <ProgressBar
              value={file.percent}
              className={cn('h-1', file.status === 'finishing' && 'animate-pulse')}
            />
          </span>
        );
      })}

      {canWrite && (
        <>
          <MediaUploader
            accept={ATTACHMENT_ACCEPT}
            variant="ghost"
            label={t('uploads.addFile')}
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            // The picker only — the queue above does the uploading, so picked
            // files get the same per-file progress and cancel as dropped ones.
            onSelect={enqueue}
          />
          {/* Only worth saying while it's empty — after that the row explains itself. */}
          {!items.length && !busy && (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground/70 sm:inline-flex">
              <Paperclip className="size-3" aria-hidden /> {t('uploads.filesHint')}
            </span>
          )}
        </>
      )}

      {viewing !== null && (
        <FilePreviewDialog
          files={items}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );

  if (!title) return row;

  return (
    // The whole section is the drop target, not just the chips: on a record with
    // no files yet the row is one small button, which is a hard thing to aim at.
    <section
      {...dropHandlers}
      className={cn(
        'flex flex-col gap-2 rounded-md transition-colors',
        dragging && 'bg-primary/5 outline-dashed outline-1 outline-offset-2 outline-primary/40',
        className,
      )}
    >
      {/* Same eyebrow heading as the neighbouring SUB-TASKS / LINKED DOCS sections. */}
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Paperclip className="size-3.5" aria-hidden />
        {title}
        {items.length > 0 && <span className="tabular-nums">({items.length})</span>}
      </h3>
      {row}
    </section>
  );
}

/**
 * The glyph for a file, by stored content type. Monochrome on purpose: a row of
 * red/green/blue file icons would be the only place in the app inventing colour
 * outside the brand palette.
 */
function glyphFor(contentType: string, name: string) {
  const type = contentType.toLowerCase();
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.includes('spreadsheet') || type === 'text/csv' || ext === 'xls' || ext === 'csv')
    return FileSpreadsheet;
  if (type.includes('presentation') || ext === 'ppt' || ext === 'pptx') return Presentation;
  if (type === 'application/pdf' || type.startsWith('text/') || type.includes('word'))
    return FileText;
  return FileIcon;
}
