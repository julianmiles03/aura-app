import { useRef, useState } from 'react';
import { api } from '../api.js';
import { friendlyError } from '../friendlyError.js';
import { illustratedAvatar } from '../illustrated.js';
import Icon from './Icon.jsx';
import { Spinner } from './Loading.jsx';
import { Sheet } from './ui.jsx';

// What the server accepts (see server/src/lib/storage.js). Checking here first gives an instant message.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 4; // 1 main + 3 more
const EXTRA_SLOTS = 3;

// Your photos: the main photo big on top (your avatar everywhere else in the app), 3 more under it.
// Without an uploaded main photo you get your illustrated avatar. Tap a photo for its options
// (Make main, Remove); "Add photo" opens the camera roll on phones and the file picker on desktops.
// `children` (e.g. the name and bio) go between the main photo and the 3 more.
export default function PhotoGrid({ photos, ownerName, ownerId, avatarColor, onChanged, children }) {
  const input = useRef(null);
  const asMain = useRef(false); // whether the photo being picked should become the main photo
  const [preview, setPreview] = useState(null); // { url, main } shown while it uploads
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // photo whose options sheet is open

  const [main, ...extras] = photos;
  const mainUrl = main?.imageUrl;
  const isFull = photos.length >= MAX_PHOTOS;

  const run = async (fn) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const pick = (main) => {
    asMain.current = main;
    setSelected(null);
    input.current?.click();
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still triggers a change
    if (!file) return;
    setError(null);
    if (!PHOTO_TYPES.includes(file.type)) return setError('Choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_BYTES) return setError('That photo is too big. Choose one under 5 MB.');

    const url = URL.createObjectURL(file);
    const main = asMain.current && photos.length > 0;
    setPreview({ url, main: asMain.current || photos.length === 0 });
    await run(async () => {
      const { photo } = await api('/me/photos/upload', { method: 'POST', file });
      if (main) await api(`/me/photos/${photo.id}/main`, { method: 'POST' });
    });
    setPreview(null);
    URL.revokeObjectURL(url);
  };

  const makeMain = (photo) => { setSelected(null); run(() => api(`/me/photos/${photo.id}/main`, { method: 'POST' })); };
  const remove = (photo) => { setSelected(null); run(() => api(`/me/photos/${photo.id}`, { method: 'DELETE' })); };

  const name = (photo) => (photo === main ? 'main photo' : `photo ${photos.indexOf(photo) + 1}`);
  const freeSlots = Math.max(0, EXTRA_SLOTS - extras.length - (preview && !preview.main ? 1 : 0));

  return (
    <>
      <button
        type="button"
        className="photo-hero"
        onClick={() => (main ? setSelected(main) : pick(true))}
        disabled={busy}
        aria-label={mainUrl ? `${ownerName}'s main photo. Photo options` : `${ownerName}'s illustrated avatar. Add a main photo`}
      >
        <img className="photo__img" src={preview?.main ? preview.url : mainUrl ?? illustratedAvatar(ownerId, avatarColor)} alt="" />
        {preview?.main && <UploadStatus />}
        {!mainUrl && !preview && (
          <span className="photo-hero__cta"><Icon name="plus" size={18} /> Add a main photo</span>
        )}
      </button>
      {children}

      <h3 className="section-label photos__label">More photos · {extras.length} of {EXTRA_SLOTS}</h3>
      <div className="photos photos--extra">
        {extras.map((p) => (
          <button key={p.id} type="button" className="photo" onClick={() => setSelected(p)} disabled={busy}
            aria-label={p.imageUrl ? `${ownerName}'s ${name(p)}. Photo options` : `${name(p)}, not uploaded yet. Photo options`}>
            {p.imageUrl ? <img className="photo__img" src={p.imageUrl} alt="" /> : <span className="photo__empty" aria-hidden="true">No photo yet</span>}
          </button>
        ))}
        {preview && !preview.main && (
          <div className="photo photo--uploading" aria-busy="true">
            <img className="photo__img" src={preview.url} alt="" />
            <UploadStatus />
          </div>
        )}
        {Array.from({ length: freeSlots }, (_, i) => (
          i === 0 && !isFull ? (
            <button key="add" type="button" className="photo photo--add" onClick={() => pick(false)} disabled={busy || !!preview}>
              <Icon name="plus" size={24} />
              Add photo
            </button>
          ) : <div key={`empty-${i}`} className="photo photo--slot" aria-hidden="true" />
        ))}
      </div>

      {/* Hidden picker. Listing exact types makes iPhones convert HEIC photos to JPEG automatically. */}
      <input ref={input} type="file" accept={PHOTO_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={upload} />
      {error && <p className="form-error photo-error" role="alert">{error}</p>}

      {selected && (
        <Sheet title={selected === main ? 'Main photo' : 'Photo'} onClose={() => setSelected(null)}>
          {selected.imageUrl && <img className="photo-sheet__img" src={selected.imageUrl} alt={`${ownerName}'s ${name(selected)}`} />}
          <div className="photo-sheet__actions">
            {selected === main ? (
              !isFull && <button type="button" className="btn btn--primary btn--block" onClick={() => pick(true)}>Upload a new main photo</button>
            ) : (
              selected.imageUrl && <button type="button" className="btn btn--primary btn--block" onClick={() => makeMain(selected)}>Make main photo</button>
            )}
            {photos.length > 1 && (
              <button type="button" className="btn btn--danger btn--block" onClick={() => remove(selected)}>Remove photo</button>
            )}
          </div>
          <p className="muted-small photo-hint">
            {photos.length > 1 ? 'Your main photo is what other groups see first.' : 'Keep at least one photo. Add another to change this one.'}
            {' '}JPEG, PNG or WebP, up to 5 MB.
          </p>
        </Sheet>
      )}
    </>
  );
}

function UploadStatus() {
  return (
    <span className="photo__status" role="status">
      <Spinner size={22} />
      Uploading…
    </span>
  );
}
