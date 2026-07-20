import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { uploadMedia, type UploadedMedia } from '@/features/uploads/api';

interface MediaUploaderProps {
  /** Called once per successfully uploaded file. */
  onUploaded: (media: UploadedMedia) => void;
  /** File picker filter. Defaults to images + videos. */
  accept?: string;
  /** Button label. Defaults to "Upload". */
  label?: string;
  /** Allow selecting several files at once. */
  multiple?: boolean;
  size?: 'sm' | 'default';
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  disabled?: boolean;
}

/**
 * The one uploader every media surface uses — bug attachments, report sections,
 * anywhere. A button that opens the file picker, uploads each pick to the
 * configured storage (sequentially, so one failure doesn't sink the rest), and
 * hands each result back via `onUploaded`. Errors show the API's message as a toast.
 */
export function MediaUploader({
  onUploaded,
  accept = 'image/*,video/*',
  label,
  multiple = true,
  size = 'sm',
  variant = 'secondary',
  className,
  disabled,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        try {
          onUploaded(await uploadMedia(file));
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
    } finally {
      setBusy(false);
      // Reset so picking the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn(className)}
        loading={busy}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {!busy && <Upload className="mr-1.5 size-4" />}
        {label ?? t('uploads.add')}
      </Button>
    </>
  );
}
