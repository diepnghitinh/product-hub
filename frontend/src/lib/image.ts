/**
 * Downscale + re-encode an image entirely in the browser, *before* upload, so we
 * ship a small avatar instead of a multi-megabyte camera photo. The image is
 * cover-cropped to a centred square and re-encoded as WebP — a 3 MB JPEG
 * typically lands under 40 KB. Phone-photo EXIF rotation is honoured
 * (`imageOrientation: 'from-image'`) so portraits don't come out sideways.
 *
 * Dependency-free (canvas only). Returns a small `File` ready for `uploadMedia`.
 */
export async function compressAvatar(
  file: File,
  size = 256,
  quality = 0.85,
): Promise<File> {
  const bitmap = await decodeImage(file);
  try {
    // Cover-crop: take the largest centred square, then scale it to `size`.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    return await renderAvatarCrop(bitmap, sx, sy, side, size, quality);
  } finally {
    bitmap.close();
  }
}

/**
 * Encode an arbitrary square sub-region of an already-decoded image into a small
 * WebP avatar `File`. `(sx, sy, sSize)` is that square in the source bitmap's own
 * pixels — exactly what a manual cropper computes from its pan/zoom. Sharing one
 * `ImageBitmap` between the on-screen preview and this call keeps what the user
 * frames pixel-identical to what we upload. Caller owns the bitmap's lifetime
 * (so it can render more crops); this does not close it.
 */
export async function renderAvatarCrop(
  source: ImageBitmap,
  sx: number,
  sy: number,
  sSize: number,
  size = 256,
  quality = 0.85,
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sSize, sSize, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  );
  if (!blob) throw new Error('Could not process the image.');
  return new File([blob], 'avatar.webp', { type: 'image/webp' });
}

/** Decode a file to an ImageBitmap, honouring EXIF orientation where supported. */
export async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older engines lack the options overload — fall back to a plain decode.
    return await createImageBitmap(file);
  }
}
