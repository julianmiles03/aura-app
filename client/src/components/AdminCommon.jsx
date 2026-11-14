import { useEffect, useState } from 'react';
import { adminApi } from '../adminApi.js';
import { canRetry, friendlyError } from '../friendlyError.js';

// Small pieces the admin portal's pages share (screens/AdminPortal.jsx, screens/AdminGroups.jsx).

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
