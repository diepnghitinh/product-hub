import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button, Dialog, Spinner } from '@/components/ui';
import { decodeImage, renderAvatarCrop } from '@/lib/image';
import { t } from '@/i18n';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
/** Largest on-screen crop viewport; shrinks to fit narrow screens (see measure). */
const MAX_VIEWPORT = 320;

/** Geometry of the source image laid out inside a `V`×`V` square at a given zoom. */
function layout(nw: number, nh: number, viewport: number, zoom: number) {
  // `cover` scale fills the square at zoom 1, so the circle is never let-boxed.
  const s = (viewport / Math.min(nw, nh)) * zoom;
  const dw = nw * s;
  const dh = nh * s;
  // How far the image may pan before an edge would expose empty viewport.
  const maxTx = Math.max(0, (dw - viewport) / 2);
  const maxTy = Math.max(0, (dh - viewport) / 2);
  return { s, dw, dh, maxTx, maxTy };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface AvatarCropDialogProps {
  open: boolean;
  /** The freshly picked file to crop. Null while the dialog is closed. */
  file: File | null;
  /** True while the parent is uploading the cropped result. */
  saving?: boolean;
  onCancel: () => void;
  /** Receives the cropped 256px WebP; the parent uploads + closes. */
  onConfirm: (cropped: File) => void;
}

/**
 * Interactive circular avatar cropper. The user drags to reposition and zooms
 * (slider or wheel); a live canvas preview shows exactly the circle we'll keep.
 * Export reuses the *same* decoded `ImageBitmap` the preview draws, so the saved
 * avatar is pixel-identical to what was framed — and EXIF orientation is
 * normalised once, at decode. Dependency-free (canvas only), matching lib/image.
 */
export function AvatarCropDialog({ open, file, saving, onCancel, onConfirm }: AvatarCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Decode the picked file once. The bitmap lives in a ref (drawn every frame);
  // `ready` flips the render from spinner to canvas. Reset framing per new file.
  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setReady(false);
    setError(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    decodeImage(file)
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        bitmapRef.current = bmp;
        setReady(true);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [open, file]);

  // Measure the square viewport from its container so it stays responsive.
  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setViewport(Math.min(MAX_VIEWPORT, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, ready]);

  // Redraw the preview whenever framing or size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const bmp = bitmapRef.current;
    if (!canvas || !bmp || !viewport) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(viewport * dpr);
    canvas.height = Math.round(viewport * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const { dw, dh } = layout(bmp.width, bmp.height, viewport, zoom);
    const left = viewport / 2 + pan.x - dw / 2;
    const top = viewport / 2 + pan.y - dh / 2;

    ctx.clearRect(0, 0, viewport, viewport);
    ctx.drawImage(bmp, left, top, dw, dh);

    // Dim everything outside the circle so the kept region reads at a glance.
    const r = viewport / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewport, viewport);
    ctx.moveTo(r + r, r); // start the circle subpath without a connecting line
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.clip('evenodd');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, viewport, viewport);
    ctx.restore();

    // Crisp ring on the crop edge.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [viewport, zoom, pan, ready]);

  // Drag-to-pan. Deltas are in CSS px, which equal viewport units 1:1.
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!ready) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { px: e.clientX, py: e.clientY, x: pan.x, y: pan.y };
    },
    [ready, pan],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const start = drag.current;
      const bmp = bitmapRef.current;
      if (!start || !bmp || !viewport) return;
      const { maxTx, maxTy } = layout(bmp.width, bmp.height, viewport, zoom);
      setPan({
        x: clamp(start.x + (e.clientX - start.px), -maxTx, maxTx),
        y: clamp(start.y + (e.clientY - start.py), -maxTy, maxTy),
      });
    },
    [viewport, zoom],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  // Re-clamp pan against the new bounds whenever zoom changes (slider or wheel).
  const applyZoom = useCallback(
    (next: number) => {
      const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
      const bmp = bitmapRef.current;
      setZoom(z);
      if (bmp && viewport) {
        const { maxTx, maxTy } = layout(bmp.width, bmp.height, viewport, z);
        setPan((p) => ({ x: clamp(p.x, -maxTx, maxTx), y: clamp(p.y, -maxTy, maxTy) }));
      }
    },
    [viewport],
  );

  // Wheel-to-zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoom(zoom - e.deltaY * 0.002);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [ready, zoom, applyZoom]);

  async function onSave() {
    const bmp = bitmapRef.current;
    if (!bmp || !viewport) return;
    const { s, dw, dh } = layout(bmp.width, bmp.height, viewport, zoom);
    const left = viewport / 2 + pan.x - dw / 2;
    const top = viewport / 2 + pan.y - dh / 2;
    // Map the whole viewport (the circle's bounding square) back to source pixels.
    const cropped = await renderAvatarCrop(bmp, -left / s, -top / s, viewport / s);
    onConfirm(cropped);
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t('profile.cropTitle')}
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSave} loading={saving} disabled={!ready}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div ref={wrapRef} className="mx-auto aspect-square w-full max-w-[320px]">
          {ready ? (
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ width: viewport, height: viewport }}
              className="touch-none cursor-grab rounded-lg bg-muted active:cursor-grabbing"
            />
          ) : (
            <div className="grid size-full place-items-center rounded-lg bg-muted">
              {error ? (
                <span className="px-4 text-center text-sm text-muted-foreground">
                  {t('profile.photoInvalid')}
                </span>
              ) : (
                <Spinner className="size-6 text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        {/* Zoom */}
        <div className="flex w-full max-w-[320px] items-center gap-3">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!ready}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('profile.zoom')}
          />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
        </div>

        <p className="text-center text-xs text-muted-foreground">{t('profile.cropHint')}</p>
      </div>
    </Dialog>
  );
}
