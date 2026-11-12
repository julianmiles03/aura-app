import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import FlameMark from '../components/FlameMark.jsx';
import Icon from '../components/Icon.jsx';
import { LoadingStatus, Skeleton, Spinner } from '../components/Loading.jsx';
import { formatDay } from '../format.js';
import { canRetry, friendlyError } from '../friendlyError.js';

// The admin portal: #/admin (home) and #/admin/okrs (OKR Dashboard). Only users with
// users.is_admin see it; the API checks too (403 NOT_ADMIN), so hiding the link isn't the guard.
const TITLES = { home: 'Admin portal', okrs: 'OKR Dashboard' };

export default function AdminPortal({ page, me, email, onSignOut }) {
  useEffect(() => {
    document.title = `${TITLES[page]} · aura`;
    return () => { document.title = 'aura'; };
  }, [page]);

  let body;
  if (!me.user.isAdmin) body = <NotAdmin />;
  else if (page === 'okrs') body = <OkrDashboard />;
  else body = <AdminHome email={email} onSignOut={onSignOut} />;

  return (
    <div className="frame frame--admin">
      <header className="admin-bar">
        <a href="#/admin" className="wordmark admin-bar__brand">
          <FlameMark />aura<span className="admin-bar__tag">admin</span>
        </a>
        <a href="#/find" className="btn btn--outline btn--sm">Back to app</a>
      </header>
      <main className="screen screen--admin">{body}</main>
    </div>
  );
}

function NotAdmin() {
  return (
    <div className="empty admin-denied">
      <div className="empty__icon"><Icon name="profile" size={30} /></div>
      <h1>Admins only</h1>
      <p>The admin portal is for Team Aura admins. Ask a teammate to turn on admin access for your account.</p>
      <a href="#/find" className="btn btn--primary">Back to aura</a>
    </div>
  );
}

const TOOLS = [
  { id: 'users', title: 'Maintain Users', text: 'Look up and edit aura accounts.', icon: 'users' },
  { id: 'records', title: 'Maintain Records', text: 'Fix groups, matches and chats.', icon: 'archive' },
  { id: 'okrs', title: 'OKR Dashboard', text: 'KR1-KR4, live from real activity, against our targets.', icon: 'chart', href: '#/admin/okrs' },
];

function AdminHome({ email, onSignOut }) {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Admin portal</h1>
      </div>
      <p className="admin-signed-in">Signed in as <strong>{email}</strong></p>
      <ul className="admin-tiles">
        {TOOLS.map((tool) => {
          const inner = (
            <>
              <span className="admin-tile__icon"><Icon name={tool.icon} size={26} /></span>
              <span className="admin-tile__text">
                <span className="admin-tile__title">{tool.title}</span>
                <span className="admin-tile__desc">{tool.text}</span>
                {tool.href
                  ? <span className="admin-tile__go">Open<Icon name="chevronRight" size={20} /></span>
                  : <span className="admin-tile__soon">Coming soon</span>}
              </span>
            </>
          );
          return (
            <li key={tool.id}>
              {tool.href
                ? <a href={tool.href} className="admin-tile">{inner}</a>
                : <button type="button" className="admin-tile admin-tile--soon" disabled>{inner}</button>}
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn--outline btn--block admin-signout" onClick={onSignOut}>Log out</button>
    </>
  );
}

// "60%" or "33.3%"; while there's nothing to divide by, a dash (read out as "none yet").
const formatPct = (pct) => (pct === null || pct === undefined
  ? <><span aria-hidden="true">–</span><span className="sr-only">none yet</span></>
  : `${pct}%`);
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
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
      const next = await api('/admin/okrs');
      if (id !== latest.current) return;
      setData(next);
      if (manual) setAnnouncement(`OKRs updated at ${clock.format(new Date(next.asOf))}.`);
    } catch (err) {
      if (id === latest.current) setError(err);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error?.code === 'NOT_ADMIN') return <NotAdmin />;

  const refreshing = loading && data;
  return (
    <>
      <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
      <header className="page-head okr-head">
        <h1 className="page-title">OKR Dashboard</h1>
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
            Live from the database, updated {formatDay(data.asOf)} at {clock.format(new Date(data.asOf))}.
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
