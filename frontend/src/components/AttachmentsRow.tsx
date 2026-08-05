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
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { formatFileSize } from '@/lib/format';
import { ATTACHMENT_ACCEPT, canPreview, downloadFile, safeFileUrl } from '@/lib/filePreview';
import { uploadMedia } from '@/features/uploads/api';
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
 * page has no Save button to stage anything for. Dropping files onto the row
 * works too; the drop target is the row itself rather than the whole page, so it
 * never competes with the editor's own drag handling for images.
 */
export function AttachmentsRow({
  items,
  canWrite,
  onChange,
  preview = true,
  title,
  className,
}: AttachmentsRowProps) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Which file the viewer is showing; null when it's closed.
  const [viewing, setViewing] = useState<number | null>(null);
  // Depth counter so dragging across the chips inside doesn't flicker the hint.
  const depth = useRef(0);

  // Nothing attached and nothing to attach with — don't leave an empty rule
  // across the page (this is how it renders on the public view).
  if (!items.length && !canWrite) return null;

  async function uploadAll(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    // Accumulated locally: `items` is captured from this render, so appending one
    // at a time would make every file overwrite the one before it.
    const added: AttachedFile[] = [];
    try {
      for (const file of list) {
        try {
          added.push(await uploadMedia(file));
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
    } finally {
      setBusy(false);
      if (added.length) onChange?.([...items, ...added]);
    }
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
          void uploadAll(e.dataTransfer.files);
        },
      }
    : {};

  const row = (
    <div
      {...dropHandlers}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md transition-colors',
        dragging && 'bg-primary/5 outline-dashed outline-1 outline-offset-2 outline-primary/40',
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

      {canWrite && (
        <>
          <MediaUploader
            accept={ATTACHMENT_ACCEPT}
            variant="ghost"
            label={t('uploads.addFile')}
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            disabled={busy}
            // The batch callback, not the per-file one: picking four files at
            // once has to append four, not overwrite three (see MediaUploader).
            onUploadedAll={(files) => onChange?.([...items, ...files])}
          />
          {/* Only worth saying while it's empty — after that the row explains itself. */}
          {!items.length && (
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
    <section className={cn('flex flex-col gap-2', className)}>
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
