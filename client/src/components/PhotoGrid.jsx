import { useRef, useState } from 'react';
import { api } from '../api.js';
import { friendlyError } from '../friendlyError.js';
import Icon from './Icon.jsx';
import { Spinner } from './Loading.jsx';

// What the server accepts (see server/src/lib/storage.js). Checking here first gives an instant message.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 3;
const TINTS = ['#E6E1FF', '#DDF3E0', '#FDDCCB'];
const INKS = ['#4C1D95', '#166534', '#9A3412'];

// Profile photos (1-3): real images from Supabase Storage, or the old labeled placeholders.
// "Add photo" opens the camera roll on phones and the file picker on desktops, shows a preview
// while the photo uploads, and every photo except the last one has a remove button.
export default function PhotoGrid({ photos, ownerName, onChanged }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null); // local image shown while it uploads
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still triggers a change
    if (!file) return;
    setError(null);
    if (!PHOTO_TYPES.includes(file.type)) return setError('Choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_BYTES) return setError('That photo is too big. Choose one under 5 MB.');

    const url = URL.createObjectURL(file);
    setPreview(url);
    setBusy(true);
    try {
      await api('/me/photos/upload', { method: 'POST', file });
      await onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPreview(null);
      setBusy(false);
      URL.revokeObjectURL(url);
    }
  };

  const remove = async (photo) => {
    setError(null);
    setBusy(true);
    try {
      await api(`/me/photos/${photo.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const canAdd = photos.length < MAX_PHOTOS && !preview;

  return (
    <>
      <div className="photos">
        {photos.map((p, i) => (
          <div key={p.id} className="photo" style={{ background: TINTS[i % 3], color: INKS[i % 3] }}>
            {p.imageUrl
              ? <img className="photo__img" src={p.imageUrl} alt={`${ownerName}'s ${p.label.toLowerCase()}`} />
              : `[${p.label}]`}
            {photos.length > 1 && (
              <button
                type="button"
                className="photo__remove"
                aria-label={`Remove ${p.label}`}
                onClick={() => remove(p)}
                disabled={busy}
              >
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
        ))}
        {preview && (
          <div className="photo photo--uploading" aria-busy="true">
            <img className="photo__img" src={preview} alt="" />
            <span className="photo__status" role="status">
              <Spinner size={22} />
              Uploading…
            </span>
          </div>
        )}
        {canAdd && (
          <button type="button" className="photo photo--add" onClick={() => input.current?.click()} disabled={busy}>
            <Icon name="plus" size={28} />
            Add photo
          </button>
        )}
      </div>
      {/* Hidden picker. Listing exact types makes iPhones convert HEIC photos to JPEG automatically. */}
      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={upload}
      />
      {error && <p className="form-error photo-error" role="alert">{error}</p>}
      <p className="muted-small photo-hint">JPEG, PNG or WebP, up to 5 MB each.</p>
    </>
  );
}
