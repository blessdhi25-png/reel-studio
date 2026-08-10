// Resizes an image file down to a max edge length and re-encodes it as a
// quality-reduced JPEG before it ever leaves the browser, so avatar/banner
// uploads stay small — and fast on slow connections — without pulling in
// an extra dependency (browser-image-compression etc.). Everything here is
// native createImageBitmap()/Canvas/Blob, already available in every
// browser this app targets.
export async function compressImage(file, { maxDimension = 1200, quality = 0.82 } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;

  // Re-encoding a GIF through canvas would collapse an animation down to
  // its first frame — just pass those through untouched.
  if (file.type === 'image/gif') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Some browsers/formats (e.g. HEIC without a decoder) can fail to
    // decode here — fall back to uploading the original rather than
    // blocking the upload entirely.
    return file;
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return file; // encoding failed for some reason — upload the original instead of failing outright

  // Skip the swap if compression didn't actually help (e.g. a small image
  // where JPEG re-encoding overhead outweighs the original file size).
  if (blob.size >= file.size) return file;

  const newName = file.name.replace(/\.[^./\\]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg' });
}
