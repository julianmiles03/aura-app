import { useEffect, useState } from 'react';
import { adminApi } from '../adminApi.js';
import { canRetry, friendlyError } from '../friendlyError.js';
import { Spinner } from './Loading.jsx';
import { FormError, Sheet, useAsyncAction } from './ui.jsx';

// Small pieces the admin portal's pages share (screens/AdminPortal.jsx, AdminGroups.jsx, AdminUsers.jsx).

// "1 group", "3 groups", "1,204 rows".
export const plural = (n, word, many = `${word}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`;
export const fullName = (p) => `${p.firstName} ${p.lastName}`;

// Loads one admin API path; `reload` asks again (for "Try again").
export function useAdminData(path) {
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setState((s) => ({ data: s.data, error: null }));
    adminApi(path)
      .then((data) => current && setState({ data, error: null }))
      .catch((error) => current && setState((s) => ({ data: s.data, error })));
    return () => { current = false; };
  }, [path, attempt]);
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}

export function LoadError({ what, error, onRetry }) {
  return (
    <div className="empty">
      <h2>Can't load {what}</h2>
      <p>{friendlyError(error)}</p>
      {canRetry(error) && <button type="button" className="btn btn--primary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// A yes/no question before something that can't be undone. Focus starts on Cancel.
export function ConfirmSheet({ title, children, confirmLabel, busyLabel, onConfirm, onClose }) {
  const { busy, error, run } = useAsyncAction();
  return (
    <Sheet title={title} onClose={busy ? () => {} : onClose}>
      <FormError error={error} />
      <div className="admin-confirm__body">{children}</div>
      <div className="admin-confirm__actions">
        {/* autoFocus: a question that can't be undone starts on its safe answer. */}
        <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy} autoFocus>Cancel</button>
        <button type="button" className="btn btn--danger-solid" onClick={() => run(onConfirm)} disabled={busy}>
          {busy && <Spinner size={18} />}{busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

// One labeled field with its error (or hint) and, for text with a limit, a "12/50" count under it.
// The error is tied to the input (aria-describedby), so screen readers read it with the field.
export function AdminField({ id, label, error, hint, count, max, children }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {children}
      <div className="field__foot">
        {error
          ? <span id={`${id}-error`} className="field__error">{error}</span>
          : hint && <span id={`${id}-hint`} className="field__hint">{hint}</span>}
        {max && <span className="field__count" aria-hidden="true">{count}/{max}</span>}
      </div>
    </div>
  );
}
