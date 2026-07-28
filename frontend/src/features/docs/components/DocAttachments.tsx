import { useRef, useState, type DragEvent } from 'react';
import {
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
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { formatFileSize } from '@/lib/format';
import { uploadMedia } from '@/features/uploads/api';
import type { DocAttachment } from '@/types/dto';

interface DocAttachmentsProps {
  items: DocAttachment[];
  /** Read-only when false: chips still download, nothing can be added or removed. */
  canWrite: boolean;
  /** The whole list after the change — the page saves it as one field. */
  onChange?: (next: DocAttachment[]) => void;
  className?: string;
}

/**
 * What the file picker offers. Mirrors the backend's `DOCUMENT_TYPE_BY_EXT` plus
 * images, which the API already accepts — someone attaching a screenshot beside
 * the spec shouldn't be told to put it in the body instead.
 */
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.rtf,image/*';

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

/**
 * The files attached to one doc page, as a row of chips beneath the links row.
 *
 * Uploads go straight to the workspace storage and the new list is handed back
 * for the page to save — there's no staging step, because there's no Save button
 * on a doc page to stage anything for. Dropping files onto the row works too;
 * the drop target is the row itself rather than the whole page, so it never
 * competes with the editor's own drag handling for images.
 */
export function DocAttachments({ items, canWrite, onChange, className }: DocAttachmentsProps) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
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
    const added: DocAttachment[] = [];
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

  return (
    <div
      {...dropHandlers}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md transition-colors',
        dragging && 'bg-primary/5 outline-dashed outline-1 outline-offset-2 outline-primary/40',
        className,
      )}
    >
      {items.map((file) => {
        const Glyph = glyphFor(file.contentType, file.name);
        const size = formatFileSize(file.size);
        return (
          <span
            key={file.url}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs"
          >
            <Glyph className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              download={file.name}
              title={file.name}
              className="max-w-[180px] truncate font-medium text-foreground hover:text-primary sm:max-w-[220px]"
            >
              {file.name}
            </a>
            {size && <span className="shrink-0 text-muted-foreground">{size}</span>}
            {canWrite ? (
              <button
                type="button"
                aria-label={t('docs.fileRemove')}
                title={t('docs.fileRemove')}
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
            accept={ACCEPT}
            variant="ghost"
            label={t('docs.addFile')}
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            disabled={busy}
            // The batch callback, not the per-file one: picking four files at
            // once has to append four, not overwrite three (see MediaUploader).
            onUploadedAll={(files) => onChange?.([...items, ...files])}
          />
          {/* Only worth saying while it's empty — after that the row explains itself. */}
          {!items.length && (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground/70 sm:inline-flex">
              <Paperclip className="size-3" aria-hidden /> {t('docs.filesHint')}
            </span>
          )}
        </>
      )}
    </div>
  );
}
