import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { isVideoUrl } from '@/features/uploads/useMediaAttachments';
import type { UploadedMedia } from '@/features/uploads/api';

/**
 * The media a posted comment carries — read-only. Images open full-size in a new
 * tab; short videos play inline. Type is inferred from the stored URL. Renders
 * nothing when the comment has no attachments.
 */
export function CommentMedia({ urls, className }: { urls: string[]; className?: string }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className={cn('mt-2 flex flex-wrap gap-2', className)}>
      {urls.map((url, i) =>
        isVideoUrl(url) ? (
          <video
            key={i}
            src={url}
            controls
            className="max-h-56 w-auto max-w-full rounded-md border sm:max-w-[280px]"
          />
        ) : (
          <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
            <img
              src={url}
              alt=""
              loading="lazy"
              className="max-h-56 w-auto max-w-full rounded-md border object-cover sm:max-w-[280px]"
            />
          </a>
        ),
      )}
    </div>
  );
}

/**
 * The pending attachments inside a composer — thumbnails a user can remove
 * before posting, plus a placeholder tile while an upload is in flight.
 */
export function AttachmentStrip({
  items,
  busy,
  onRemove,
  className,
}: {
  items: UploadedMedia[];
  busy?: boolean;
  onRemove: (index: number) => void;
  className?: string;
}) {
  if (items.length === 0 && !busy) return null;
  return (
    <div className={cn('flex flex-wrap gap-2 px-1', className)}>
      {items.map((m, i) => (
        <div key={i} className="relative">
          {m.contentType.startsWith('video/') ? (
            <video src={m.url} className="size-16 rounded-md border object-cover" />
          ) : (
            <img src={m.url} alt={m.name} className="size-16 rounded-md border object-cover" />
          )}
          <button
            type="button"
            aria-label={t('uploads.remove')}
            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-destructive"
            onClick={() => onRemove(i)}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {busy && (
        <div className="grid size-16 place-items-center rounded-md border border-dashed">
          <Spinner className="size-4" />
        </div>
      )}
    </div>
  );
}

/** An icon button that opens the file picker as a click-to-attach fallback. */
export function AttachMediaButton({
  onFiles,
  disabled,
}: {
  onFiles: (files: FileList | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <button
        type="button"
        aria-label={t('activity.attach')}
        title={t('activity.attach')}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <ImagePlus className="size-4" />
      </button>
    </>
  );
}
