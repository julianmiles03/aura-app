import { useRef, useState } from 'react';
import { api } from '../api.js';
import { friendlyError } from '../friendlyError.js';
import Icon from './Icon.jsx';
import { Spinner } from './Loading.jsx';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

// Group photo in Manage group. The owner can upload, replace or remove it (saved right away,
// separate from "Save changes"); other members just see it. It shows on the Find card,
// in Messages, in the chat header and on Profile → My groups.
export default function GroupPhotoField({ group, canEdit, onChanged }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setError(null);
    setBusy(true);
    try {
      const { group: updated } = await fn();
      await onChanged(updated);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setError('Choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_BYTES) return setError('That photo is too big. Choose one under 5 MB.');
    const url = URL.createObjectURL(file);
    setPreview(url);
    await run(() => api(`/groups/${group.id}/photo`, { method: 'PUT', file }));
    setPreview(null);
    URL.revokeObjectURL(url);
  };

  const src = preview ?? group.photoUrl;
  return (
    <div className="group-photo-field">
      <h3 className="section-label">Group photo</h3>
      <div className="group-photo-field__row">
        <div className={`group-photo-field__img ${preview ? 'photo--uploading' : ''}`} aria-busy={busy || undefined}>
          {src
            ? <img className="photo__img" src={src} alt={preview ? '' : `${group.name}'s group photo`} />
            : <span role="img" aria-label={`${group.name} has no group photo yet`}><Icon name="users" size={28} /></span>}
          {preview && <span className="photo__status" role="status"><Spinner size={20} />Uploading…</span>}
        </div>
        {canEdit ? (
          <div className="group-photo-field__actions">
            <button type="button" className="btn btn--soft btn--sm" disabled={busy} onClick={() => input.current?.click()}>
              {group.photoUrl ? 'Replace photo' : 'Upload photo'}
            </button>
            {group.photoUrl && (
              <button type="button" className="btn btn--sm btn--danger-outline" disabled={busy}
                onClick={() => run(() => api(`/groups/${group.id}/photo`, { method: 'DELETE' }))}>
                Remove photo
              </button>
            )}
          </div>
        ) : (
          <p className="muted-small">Only the group's owner can change the group photo.</p>
        )}
      </div>
      {canEdit && (
        <input ref={input} type="file" accept={PHOTO_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={upload} />
      )}
      {error && <p className="form-error photo-error" role="alert">{error}</p>}
    </div>
  );
}
