import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_SIGNED_OUT_EVENT, adminApi } from '../adminApi.js';
import FlameMark from '../components/FlameMark.jsx';
import Icon from '../components/Icon.jsx';
import { Loader, LoadingStatus, Skeleton, Spinner } from '../components/Loading.jsx';
import { Field, FormError, useAsyncAction, useToast } from '../components/ui.jsx';
import { formatDay } from '../format.js';
import { canRetry, friendlyError } from '../friendlyError.js';
import dashboardShot from '../assets/admin-okr-dashboard.webp';

// The admin portal. Signed out, #/admin (and every other admin page) is the landing page with the
// sign-in form. Signed in: #/admin (home), #/admin/records, #/admin/tables/:name, #/admin/okrs.
//
// It has its own sign-in, separate from the app's: an admin account (admin_users) and an httpOnly
// session cookie (see adminApi.js and server/src/lib/adminAuth.js). Hiding the tools until sign-in
// is for people; the real guard is the API, which answers 401 to any admin request without a session.

const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const pageTitle = (page) => ({ okrs: 'OKR Dashboard', records: 'Maintain Records' })[page] ?? 'Admin portal';

export default function AdminPortal({ page, tableName }) {
  // undefined while we ask the API whether this browser has a session, then null or { email, expiresAt }.
  const [admin, setAdmin] = useState(undefined);
  // A message for the sign-in card: why you're seeing it ("You logged out.", "Your session ended.").
  const [notice, setNotice] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const toast = useToast();
  // Signing in or out swaps the whole page, and the button that had focus goes with it. Then focus
  // moves to the new page's heading, so keyboard and screen reader users start at the top of it.
  const focusTitle = useRef(false);

  useEffect(() => {
    if (!admin) document.title = 'Admin portal · aura';
    else if (page === 'table') document.title = `${tableName} · Admin portal · aura`; // TablePage names it once loaded
    else document.title = `${pageTitle(page)} · aura`;
    return () => { document.title = 'aura'; };
  }, [admin, page, tableName]);

  // Runs after the new page is on screen (an effect runs after React has updated the page).
  useEffect(() => {
    if (focusTitle.current && admin !== undefined) {
      focusTitle.current = false;
      document.getElementById('admin-title')?.focus();
    }
  }, [admin]);

  // On load: is there already a session? The cookie is httpOnly, so only the API can tell.
  useEffect(() => {
    adminApi('/admin/session')
      .then((data) => setAdmin(data.admin))
      .catch((err) => {
        setAdmin(null);
        setNotice({ tone: 'error', text: friendlyError(err) });
      });
  }, []);

  // Any admin request that comes back "signed out" (expired, or logged out in another tab).
  useEffect(() => {
    const onSignedOut = () => {
      setAdmin((was) => {
        if (was) setNotice({ tone: 'info', text: 'Your admin session ended. Sign in again to keep going.' });
        return null;
      });
    };
    window.addEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  const signedIn = (next) => {
    setNotice(null);
    focusTitle.current = true;
    setAdmin(next);
  };

  // Log out: the API deletes the session and clears the cookie, then the tools are hidden again.
  // If the request fails, the cookie is still there (page code can't delete an httpOnly cookie),
  // so we say so instead of pretending to be logged out.
  const logOut = async () => {
    setLoggingOut(true);
    try {
      await adminApi('/admin/logout', { method: 'POST' });
      focusTitle.current = true;
      setAdmin(null);
      setNotice({ tone: 'info', text: 'You logged out.' });
      window.location.hash = '#/admin';
    } catch (err) {
      toast(`Couldn't log out. ${friendlyError(err)}`, { tone: 'error' });
    } finally {
      setLoggingOut(false);
    }
  };

  let body;
  if (admin === undefined) body = <Loader label="Loading the admin portal…" />;
  else if (!admin) body = <AdminLanding notice={notice} onSignedIn={signedIn} />;
  else if (page === 'okrs') body = <OkrDashboard />;
  else if (page === 'records') body = <RecordsPage />;
  else if (page === 'table') body = <TablePage key={tableName} name={tableName} />;
  else body = <AdminHome admin={admin} />;

  return (
    <div className={`frame frame--admin${admin === null ? ' frame--admin-landing' : ''}`}>
      <header className="admin-bar">
        <a href="#/admin" className="wordmark admin-bar__brand">
          <FlameMark />aura<span className="admin-bar__tag">admin</span>
        </a>
        {admin ? (
          <button type="button" className="btn btn--outline btn--sm" onClick={logOut} disabled={loggingOut}>
            {loggingOut ? <Spinner size={18} /> : <Icon name="logout" size={20} />}
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        ) : (
          <a href="#/" className="btn btn--outline btn--sm">Go to the app</a>
        )}
      </header>
      <main className="screen screen--admin">{body}</main>
      {admin === null && (
        <footer className="admin-foot">
          <span>© {new Date().getFullYear()} Team Aura</span>
          <a href="#/">Go to the aura app</a>
        </footer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed out: the landing page
// ---------------------------------------------------------------------------
const FEATURES = [
  { icon: 'users', title: 'Maintain users', text: 'Look through every aura profile: names, cities, bios and when each person joined.' },
  { icon: 'archive', title: 'Maintain records', text: 'Open any table behind the app, from friend groups and matches to chats, messages and meetups.' },
  { icon: 'chart', title: 'OKR Dashboard', text: 'KR1-KR4 against our targets, counted from real activity in the app every time you look.' },
];

function AdminLanding({ notice, onSignedIn }) {
  return (
    <div className="admin-landing">
      <section className="admin-landing__intro" aria-labelledby="admin-title">
        <p className="admin-eyebrow">Team Aura admin portal</p>
        <h1 id="admin-title" tabIndex={-1}>Everything behind aura, in one place.</h1>
        <p className="admin-lead">
          Admins sign in here to look after aura's accounts and records, and to see how we're doing on
          our Key Results, read live from the app's database.
        </p>
      </section>

      <AdminLoginForm notice={notice} onSignedIn={onSignedIn} />

      <figure className="admin-shot">
        <div className="admin-shot__frame">
          <div className="admin-shot__bar" aria-hidden="true"><span /><span /><span /></div>
          <img
            src={dashboardShot}
            width="1440"
            height="900"
            alt="The OKR Dashboard: four Key Result cards, each with its current percentage, its target and a progress bar."
          />
        </div>
        <figcaption>The OKR Dashboard, one of the tools you get after signing in.</figcaption>
      </figure>

      <ul className="admin-features" aria-label="What admins can do">
        {FEATURES.map((f) => (
          <li key={f.title} className="admin-feature">
            <span className="admin-tile__icon"><Icon name={f.icon} size={24} /></span>
            <span>
              <span className="admin-feature__title">{f.title}</span>
              <span className="admin-feature__text">{f.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The sign-in form. Its fields are named user_email and user_password, the same names the API
// expects and the admin_users columns use. The password goes to the API over HTTPS and is only
// ever compared with its bcrypt hash there.
function AdminLoginForm({ notice, onSignedIn }) {
  const [v, setV] = useState({ user_email: '', user_password: '' });
  const { busy, error, run } = useAsyncAction();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const { admin } = await adminApi('/admin/login', { method: 'POST', body: v });
        onSignedIn(admin);
      } catch (err) {
        setV((old) => ({ ...old, user_password: '' })); // a wrong password shouldn't stay in the box
        throw err;
      }
    });
  };
  const bad = error?.details?.field;

  return (
    <section className="card admin-login" aria-labelledby="admin-login-title">
      <h2 id="admin-login-title" className="card__title">Admin sign in</h2>
      <p className="admin-login__note">For Team Aura admins. Your aura app account doesn't work here.</p>
      {/* Why you're here ("You logged out."); replaced by the form's own error once you try again. */}
      {notice && !error && !busy && (
        <p className={notice.tone === 'error' ? 'form-error' : 'admin-notice'} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      <form onSubmit={submit}>
        <FormError error={error} id="admin-login-error" />
        <Field label="Email">
          <input
            id="user_email" name="user_email" type="email" value={v.user_email} onChange={set('user_email')}
            required maxLength={254} autoComplete="username" inputMode="email" spellCheck={false}
            aria-invalid={bad === 'user_email' || error?.code === 'ADMIN_LOGIN_FAILED' ? 'true' : undefined}
            aria-describedby={error ? 'admin-login-error' : undefined}
          />
        </Field>
        <Field label="Password">
          <input
            id="user_password" name="user_password" type="password" value={v.user_password} onChange={set('user_password')}
            required maxLength={200} autoComplete="current-password"
            aria-invalid={bad === 'user_password' || error?.code === 'ADMIN_LOGIN_FAILED' ? 'true' : undefined}
            aria-describedby={error ? 'admin-login-error' : undefined}
          />
        </Field>
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy && <Spinner size={18} />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="admin-login__fine">You stay signed in on this browser for 8 hours, or until you log out.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Signed in: home, Maintain Records and one table
// ---------------------------------------------------------------------------
// Loads one admin API path; `reload` asks again (for "Try again").
function useAdminData(path) {
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

function LoadError({ what, error, onRetry }) {
  return (
    <div className="empty">
      <h2>Can't load {what}</h2>
      <p>{friendlyError(error)}</p>
      {canRetry(error) && <button type="button" className="btn btn--primary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// These tool buttons, and the table list below them, only exist once you're signed in.
const TOOLS = [
  { title: 'Maintain Users', text: 'Every aura profile, newest first.', icon: 'users', href: '#/admin/tables/users' },
  { title: 'Maintain Records', text: 'Groups, likes, matches, chats and every other table.', icon: 'archive', href: '#/admin/records' },
  { title: 'OKR Dashboard', text: 'KR1-KR4, live from real activity, against our targets.', icon: 'chart', href: '#/admin/okrs' },
];

function AdminHome({ admin }) {
  const { data, error, reload } = useAdminData('/admin/tables');
  return (
    <>
      <div className="page-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>Admin portal</h1>
      </div>
      <p className="admin-signed-in">
        Signed in as <strong>{admin.email}</strong> until {clock.format(new Date(admin.expiresAt))}.
      </p>
      <ul className="admin-tiles">
        {TOOLS.map((tool) => (
          <li key={tool.title}>
            <a href={tool.href} className="admin-tile">
              <span className="admin-tile__icon"><Icon name={tool.icon} size={26} /></span>
              <span className="admin-tile__text">
                <span className="admin-tile__title">{tool.title}</span>
                <span className="admin-tile__desc">{tool.text}</span>
                <span className="admin-tile__go">Open<Icon name="chevronRight" size={20} /></span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <section className="admin-section" aria-labelledby="admin-tables-title">
        <h2 id="admin-tables-title" className="admin-section__title">Every table</h2>
        <p className="admin-section__text">Each table in aura's database, with a Maintain button to see its rows.</p>
        {error && !data
          ? <LoadError what="the tables" error={error} onRetry={reload} />
          : <TableList tables={data?.tables} />}
      </section>
    </>
  );
}

function RecordsPage() {
  const { data, error, reload } = useAdminData('/admin/tables');
  return (
    <>
      <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
      <div className="page-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>Maintain Records</h1>
      </div>
      <p className="admin-intro">
        Everything in aura's database apart from the users themselves (that's{' '}
        <a href="#/admin/tables/users">Maintain Users</a>). Open a table to see its newest rows.
      </p>
      {error && !data
        ? <LoadError what="the tables" error={error} onRetry={reload} />
        : <TableList tables={data?.tables.filter((t) => t.name !== 'users')} withAbout />}
    </>
  );
}

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

// One row per table, each with its own Maintain button. Skeleton rows while the counts load.
function TableList({ tables, withAbout = false }) {
  if (!tables) {
    return (
      <>
        <ul className={`admin-table-list${withAbout ? ' admin-table-list--about' : ''}`} aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <li key={n}>
              <span className="admin-table-list__text">
                <Skeleton text={16} width="55%" />
                <Skeleton text={14} width="35%" />
              </span>
              <Skeleton width={104} height={44} radius={14} />
            </li>
          ))}
        </ul>
        <LoadingStatus label="Loading the tables…" />
      </>
    );
  }
  return (
    <ul className={`admin-table-list${withAbout ? ' admin-table-list--about' : ''}`}>
      {tables.map((t) => (
        <li key={t.name}>
          <span className="admin-table-list__text">
            <span className="admin-table-list__name">{t.label}</span>
            {withAbout && <span className="admin-table-list__about">{t.about}</span>}
            <span className="admin-table-list__meta">{plural(t.rowCount, 'row')} · <code>{t.name}</code></span>
          </span>
          <a href={`#/admin/tables/${t.name}`} className="btn btn--soft btn--sm">
            Maintain<span className="sr-only"> {t.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// One table's newest rows, read only. Values are shown the way an admin needs to read them:
// timestamps as dates, empty values as "null", long text cut short (the full text is in the tooltip).
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const stamp = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function Cell({ value }) {
  if (value === null || value === undefined) return <span className="admin-cell admin-cell--null">null</span>;
  if (typeof value === 'string' && ISO_TIME.test(value)) {
    return <time className="admin-cell" dateTime={value}>{stamp.format(new Date(value))}</time>;
  }
  let text;
  if (Array.isArray(value)) text = value.length ? value.join(', ') : '(none)';
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  return <span className="admin-cell" title={text.length > 30 ? text : undefined}>{text}</span>;
}

function TablePage({ name }) {
  const { data, error, reload } = useAdminData(`/admin/tables/${encodeURIComponent(name)}`);
  const back = name === 'users'
    ? <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
    : <a href="#/admin/records" className="admin-back"><Icon name="chevronLeft" size={20} />Maintain Records</a>;

  useEffect(() => {
    if (data) document.title = `${data.name === 'users' ? 'Maintain Users' : data.label} · Admin portal · aura`;
  }, [data]);

  if (error && !data) {
    return (
      <>
        {back}
        {error.code === 'TABLE_NOT_FOUND' ? (
          <div className="empty">
            <h1 id="admin-title" tabIndex={-1}>No such table</h1>
            <p>The admin portal doesn't have a table called “{name}”.</p>
            <a href="#/admin/records" className="btn btn--primary">See all tables</a>
          </div>
        ) : <LoadError what="this table" error={error} onRetry={reload} />}
      </>
    );
  }

  if (!data) {
    return (
      <>
        {back}
        <div className="admin-table-head"><Skeleton text={34} width={220} /></div>
        <p className="admin-table-meta"><Skeleton text={15} width="70%" /></p>
        <div className="admin-table-wrap" aria-busy="true">
          <div className="admin-table-skeleton">
            {[1, 2, 3, 4, 5, 6].map((n) => <Skeleton key={n} text={14} width={`${90 - n * 6}%`} />)}
          </div>
        </div>
        <LoadingStatus label="Loading the table…" />
      </>
    );
  }

  const shown = data.rows.length;
  return (
    <>
      {back}
      <div className="admin-table-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>{data.name === 'users' ? 'Maintain Users' : data.label}</h1>
        <span className="admin-badge">View only</span>
      </div>
      <p className="admin-table-meta">
        {data.about} <strong>{plural(data.rowCount, 'row')}</strong> and {plural(data.columns.length, 'column')} in <code>{data.name}</code>
        {data.rowCount > shown ? `; these are the newest ${shown}.` : ', newest first.'}
        {' '}To change a row, use the app or Supabase's Table Editor.
      </p>
      {shown === 0 ? (
        <p className="admin-table-empty">This table has no rows yet.</p>
      ) : (
        // Scrolls sideways on narrow screens. tabIndex lets keyboard users scroll it too.
        <div className="admin-table-wrap" role="region" aria-labelledby="admin-title" tabIndex={0}>
          <table className="admin-table">
            <caption className="sr-only">{data.label}, newest first</caption>
            <thead>
              <tr>{data.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                // Rows are shown in a fixed order and never reordered, so their position is a stable key.
                <tr key={i}>{row.map((value, j) => <td key={data.columns[j]}><Cell value={value} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// OKR Dashboard
// ---------------------------------------------------------------------------
// "60%" or "33.3%"; while there's nothing to divide by, a dash (read out as "none yet").
const formatPct = (pct) => (pct === null || pct === undefined
  ? <><span aria-hidden="true">–</span><span className="sr-only">none yet</span></>
  : `${pct}%`);
const secondsClock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
// KR3 and KR4 are out of connected groups; KR1 and KR2 out of all groups.
const unitFor = (id, n) => {
  const noun = n === 1 ? 'group' : 'groups';
  return id === 'KR3' || id === 'KR4' ? `connected ${noun}` : noun;
};

function OkrDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const latest = useRef(0);

  // Every load asks the API, which reads the okr_metrics view live. Only the newest request's
  // answer is shown, so clicking Refresh twice can't leave the older numbers on screen.
  const load = useCallback(async ({ manual = false } = {}) => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const next = await adminApi('/admin/okrs');
      if (id !== latest.current) return;
      setData(next);
      if (manual) setAnnouncement(`OKRs updated at ${secondsClock.format(new Date(next.asOf))}.`);
    } catch (err) {
      if (id === latest.current) setError(err);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshing = loading && data;
  return (
    <>
      <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
      <header className="page-head okr-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>OKR Dashboard</h1>
        <button type="button" className="btn btn--outline btn--sm okr-refresh" onClick={() => load({ manual: true })}>
          {refreshing ? <Spinner size={18} /> : <Icon name="refresh" size={20} />}
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      <p className="sr-only" role="status">{announcement}</p>

      {error && data && (
        <div className="form-error okr-error" role="alert">Couldn't refresh. {friendlyError(error)} The numbers below are from the last update.</div>
      )}

      {!data && error ? (
        <div className="empty">
          <h2>Can't load the OKRs</h2>
          <p>{friendlyError(error)}</p>
          {canRetry(error) && <button type="button" className="btn btn--primary" onClick={() => load({ manual: true })}>Try again</button>}
        </div>
      ) : !data ? (
        <OkrSkeleton />
      ) : (
        <>
          <p className="okr-meta">
            Live from the database, updated {formatDay(data.asOf)} at {secondsClock.format(new Date(data.asOf))}.
            {' '}<strong>{data.totalGroups}</strong> groups, <strong>{data.connectedGroups}</strong> connected.
          </p>
          <ul className="okr-grid" aria-busy={loading ? 'true' : undefined}>
            {data.keyResults.map((kr) => <li key={kr.id}><KrCard kr={kr} /></li>)}
          </ul>
          <p className="okr-foot">
            Every number is counted from what people do in aura (matches, group members, messages and
            confirmed meetups). Nothing on this page is typed in by hand.
          </p>
        </>
      )}
    </>
  );
}

function KrCard({ kr }) {
  const hasData = kr.pct !== null && kr.outOf > 0;
  // Compare the counts, not the rounded percentage, so 49.96% never shows as on track for 50%.
  const met = hasData && kr.count * 100 >= kr.target * kr.outOf;
  const needed = hasData ? Math.max(0, Math.ceil((kr.target * kr.outOf) / 100) - kr.count) : 0;
  const lead = hasData ? Math.round((kr.pct - kr.target) * 10) / 10 : 0;
  const [table, trigger] = kr.drivenBy.split(/:\s*/, 2);
  const status = !hasData ? 'none' : met ? 'met' : 'below';
  const titleId = `okr-${kr.id}`;

  let gap;
  if (!hasData) gap = `No ${unitFor(kr.id, 0)} yet, so there's nothing to measure.`;
  else if (!met) gap = `${needed} more ${unitFor(kr.id, needed)} to reach the target.`;
  else if (lead > 0) gap = `${lead} points above target.`;
  else gap = 'Right on target.';

  return (
    <article className={`card okr-card okr-card--${status}`} aria-labelledby={titleId}>
      <div className="okr-card__top">
        <span className="okr-card__id">{kr.id}</span>
        <span className={`okr-status okr-status--${status}`}>
          {status === 'met' && <Icon name="check" size={16} strokeWidth={2.5} />}
          {{ met: 'On track', below: 'Below target', none: 'No data yet' }[status]}
        </span>
      </div>
      <h2 className="okr-card__title" id={titleId}>{kr.label}</h2>

      <dl className="okr-figures">
        <div className="okr-figures__now">
          <dt>Current</dt>
          <dd>{formatPct(kr.pct)}</dd>
        </div>
        <div className="okr-figures__target">
          <dt>Target</dt>
          <dd>{kr.target}%</dd>
        </div>
      </dl>

      <div className="okr-bar" aria-hidden="true">
        <span className="okr-bar__fill" style={{ width: `${Math.min(100, kr.pct ?? 0)}%` }} />
        <span className="okr-bar__target" style={{ left: `${kr.target}%` }} />
      </div>

      <p className="okr-count">
        <strong>{kr.count}</strong> of {kr.outOf} {unitFor(kr.id, kr.outOf)}
      </p>
      <p className="okr-gap">{gap}</p>
      <p className="okr-source">
        Goes up when {trigger}. <span className="okr-source__table">Source: <code>{table}</code></span>
      </p>
    </article>
  );
}

// Four cards shaped like the real ones while the first load is on its way.
function OkrSkeleton() {
  return (
    <>
      <p className="okr-meta"><Skeleton text={15} width="80%" /></p>
      <ul className="okr-grid" aria-busy="true">
        {[1, 2, 3, 4].map((n) => (
          <li key={n}>
            <div className="card okr-card">
              <div className="okr-card__top">
                <Skeleton width={46} height={28} radius={10} />
                <Skeleton width={96} height={28} radius={14} />
              </div>
              <Skeleton text={20} width="75%" className="okr-card__title" />
              <div className="okr-figures">
                <Skeleton width={110} height={52} radius={12} />
              </div>
              <Skeleton height={12} radius={6} className="okr-bar" />
              <Skeleton text={16} width="45%" />
              <Skeleton text={15} width="65%" />
            </div>
          </li>
        ))}
      </ul>
      <LoadingStatus label="Loading OKRs…" />
    </>
  );
}
