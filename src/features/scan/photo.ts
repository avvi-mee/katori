import { supabase } from '@/lib/supabase';

// shortcut: web-only (canvas/createImageBitmap). Phase 4 native builds use expo-image-manipulator.
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Resize to ~1024 px longest side and re-encode as JPEG ~0.7. Re-encoding through a canvas drops
 * all EXIF metadata, including GPS location, before anything leaves the phone.
 */
export async function compressPhoto(file: Blob, maxSide = 1024, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (q: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', q),
    );
  let q = quality;
  let blob = await encode(q);
  while (blob.size > MAX_BYTES && q > 0.35) {
    q -= 0.15;
    blob = await encode(q);
  }
  return blob;
}

/** Uploads to the private bucket under the user's own folder; returns the storage path. */
export async function uploadPhoto(uid: string, blob: Blob): Promise<string> {
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from('meal-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
