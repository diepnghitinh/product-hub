import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { uploadMedia, type UploadedMedia } from './api';

/**
 * Video file extensions we render with a <video> player. The upload key keeps
 * the original filename (extension included), so a stored URL alone tells us
 * whether it's a clip or a still — no content-type is persisted with a comment.
 */
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg|avi|mkv)(\?|#|$)/i;

/** True when a stored media URL points at a video rather than an image. */
export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(url);
}

function isMediaFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

/**
 * Stages image/video files for a comment composer. Drop, paste, or pick files;
 * each uploads to the workspace storage (sequentially, so one failure doesn't
 * sink the rest) and its URL is handed back to submit alongside the comment.
 * Spread `dropHandlers` onto the composer container to enable drag-and-drop.
 */
export function useMediaAttachments() {
  const [items, setItems] = useState<UploadedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Depth counter so hovering over child nodes doesn't flicker the drop hint.
  const dragDepth = useRef(0);

  const addFiles = useCallback(async (files: FileList | File[] | null | undefined) => {
    const all = files ? Array.from(files) : [];
    const media = all.filter(isMediaFile);
    if (all.length > 0 && media.length === 0) {
      toast.error(t('uploads.onlyMedia'));
      return;
    }
    if (media.length === 0) return;
    setBusy(true);
    try {
      for (const file of media) {
        try {
          const uploaded = await uploadMedia(file);
          setItems((prev) => [...prev, uploaded]);
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void addFiles(e.dataTransfer.files);
    },
    onPaste: (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        void addFiles(files);
      }
    },
  };

  return {
    items,
    urls: items.map((i) => i.url),
    busy,
    dragging,
    addFiles,
    remove,
    clear,
    dropHandlers,
  };
}
