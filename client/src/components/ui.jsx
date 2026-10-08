import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export function Sheet({ title, onClose, children }) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Focus the first field once, when the sheet opens.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector('input, textarea, select')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <div className="sheet__grip" />
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn icon-btn--plain" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  return <div className="form-error" role="alert">{error.message ?? String(error)}</div>;
}

// Submit handler helper: tracks busy/error state around an async action.
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, { tone = 'info', action, duration = 4000 } = {}) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast--error' : ''}`}>
            <span className="toast__msg">{t.message}</span>
            {t.action && (
              <button type="button" className="link-btn" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
