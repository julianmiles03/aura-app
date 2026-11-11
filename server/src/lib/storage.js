// Profile photos live in Supabase Storage (bucket "profile-photos", public).
// We call its REST API with fetch, so no Supabase client library is needed.
import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors.js';

const BUCKET = 'profile-photos';
export const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function config() {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError(503, 'UPLOADS_NOT_SET_UP', 'Photo uploads are not set up yet.');
  return { url, headers: { Authorization: `Bearer ${key}`, apikey: key } };
}

// Saves the image in the bucket under `folder` (a user id, or groups/<group id>) and returns its public URL.
export async function savePhoto(folder, bytes, contentType) {
  const { url, headers } = config();
  const path = `${folder}/${randomUUID()}.${PHOTO_TYPES[contentType]}`;
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType },
    body: bytes,
  });
  if (!res.ok) {
    console.error('Photo upload failed:', res.status, await res.text());
    throw new ApiError(502, 'UPLOAD_FAILED', "We couldn't save your photo. Try again.");
  }
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Deletes a saved image. A leftover file is harmless, so problems are only logged.
export async function removePhoto(publicUrl) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  if (!publicUrl?.includes(marker)) return; // placeholder photo, nothing stored
  try {
    const { url, headers } = config();
    const path = publicUrl.split(marker)[1];
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers });
    if (!res.ok) console.error('Photo delete failed:', res.status, await res.text());
  } catch (err) {
    console.error('Photo delete failed:', err.message);
  }
}
