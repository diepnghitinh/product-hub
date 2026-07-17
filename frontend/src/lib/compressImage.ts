export interface CompressImageOptions {
  /** Longest edge, in px. Larger images are scaled down to fit. */
  maxDimension?: number;
  /** JPEG/WebP quality, 0–1. */
  quality?: number;
  /** Output type. JPEG is smallest for screenshots/photos (the common paste). */
  mimeType?: 'image/jpeg' | 'image/webp';
}

const DEFAULTS: Required<CompressImageOptions> = {
  maxDimension: 1600,
  quality: 0.72,
  mimeType: 'image/jpeg',
};

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

/** Scale (w,h) so the longest edge is ≤ max, never upscaling. */
function fit(w: number, h: number, max: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Compress an image File to a base64 data URL, entirely in the browser: it's
 * resized to fit `maxDimension` and re-encoded at `quality`, so a multi-MB
 * screenshot paste becomes a small inline `<img src="data:…">` rather than
 * bloating the stored description.
 *
 * JPEG has no alpha, so transparency is flattened onto white — fine for the
 * screenshots this is built for. Falls back to the original data URL if the
 * canvas is unavailable or somehow produced something larger.
 */
export async function compressImageFile(
  file: Blob,
  options: CompressImageOptions = {},
): Promise<string> {
  const { maxDimension, quality, mimeType } = { ...DEFAULTS, ...options };
  const original = await readAsDataURL(file);

  try {
    const img = await loadImage(original);
    const { width, height } = fit(img.naturalWidth, img.naturalHeight, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    // White backing so flattened transparency doesn't come out black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const out = canvas.toDataURL(mimeType, quality);
    // Guard: tiny already-optimized images can re-encode larger — keep the original then.
    return out.length > 0 && out.length < original.length ? out : original;
  } catch {
    return original;
  }
}
