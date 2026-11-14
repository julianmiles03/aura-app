import { useEffect, useId, useState } from 'react';
import { adminApi } from '../adminApi.js';
import { AdminField, ConfirmSheet, fullName, LoadError, plural, useAdminData } from '../components/AdminCommon.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { Loader, LoadingStatus, Skeleton, Spinner } from '../components/Loading.jsx';
import { FormError, Sheet, useToast } from '../components/ui.jsx';
import { friendlyError } from '../friendlyError.js';

// Maintain Meetups (#/admin/meetups), in the admin portal (signed-in admins only): a table of every
// "We met up!" with Add, Edit and Delete. The API (server/src/routes/adminMeetups.js) keeps the app's
// rules: one meetup per match, "confirmed by" is someone in that match's chat, and the day can't be in
// the future or before the groups matched. Meetups are what KR4 counts on the OKR Dashboard.

const dateText = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
// A Date (or ISO string) as "YYYY-MM-DD" in this browser's time zone, the format of <input type="date">.
const localDay = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pairName = (groups) => `${groups[0].name} & ${groups[1].name}`;

// Two group avatars side by side, decorative (the names are next to them).
function Pair({ groups, size = 32 }) {
  return (
    <span className="admin-pair" aria-hidden="true">
      {groups.map((g) => <Avatar key={g.id} initials={g.initials} color={g.avatarColor} size={size} shape="square" src={g.photoUrl} />)}
    </span>
  );
}

export function MeetupsPage() {
  const { data, error, reload } = useAdminData('/admin/meetups');
  const [meetups, setMeetups] = useState(null);
  const [editing, setEditing] = useState(null); // 'new', or the meetup being edited
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();

  useEffect(() => { if (data) setMeetups(data.meetups); }, [data]);

  const newestFirst = (a, b) => new Date(b.metAt) - new Date(a.metAt) || b.id - a.id;
  const saved = (meetup, isNew) => {
    setMeetups((list) => [...list.filter((m) => m.id !== meetup.id), meetup].sort(newestFirst));
    setEditing(null);
    toast(isNew ? `Added the meetup for ${pairName(meetup.groups)}.` : 'Saved the meetup.');
  };

  return (
    <>
      <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
      <div className="page-head admin-groups-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>Maintain Meetups</h1>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
          <Icon name="plus" size={20} />Add meetup
        </button>
      </div>
      <p className="admin-intro">
        Matched groups that met in person ("We met up!" in their chat). Each match can have one, and
        every meetup counts toward KR4 on the <a href="#/admin/okrs">OKR Dashboard</a>.
      </p>

      {error && !meetups ? (
        <LoadError what="the meetups" error={error} onRetry={reload} />
      ) : !meetups ? (
        <>
          <div className="admin-table-wrap" aria-busy="true">
            <div className="admin-table-skeleton">{[1, 2, 3].map((n) => <Skeleton key={n} text={16} width={`${85 - n * 10}%`} />)}</div>
          </div>
          <LoadingStatus label="Loading meetups…" />
        </>
      ) : (
        <>
          <p className="admin-count">{plural(meetups.length, 'meetup')}.</p>
          {meetups.length === 0 ? (
            <p className="admin-table-empty">No meetups yet. Add one when two matched groups say they met up.</p>
          ) : (
            <div className="admin-table-wrap admin-crud" role="region" aria-labelledby="admin-title" tabIndex={0}>
              <table className="admin-table">
                <caption className="sr-only">Meetups, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Groups</th>
                    <th scope="col" className="admin-crud__wide">Met on</th>
                    <th scope="col" className="admin-crud__wide">Confirmed by</th>
                    <th scope="col" className="admin-crud__actions"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {meetups.map((m) => (
                    <tr key={m.id}>
                      <th scope="row" className="admin-crud__rowhead">
                        <span className="admin-crud__person">
                          <Pair groups={m.groups} />
                          <span className="admin-crud__name">
                            {pairName(m.groups)}
                            <span className="admin-crud__sub">
                              {dateText.format(new Date(m.metAt))}{m.confirmedBy && ` · ${fullName(m.confirmedBy)}`}
                            </span>
                          </span>
                        </span>
                      </th>
                      <td className="admin-crud__wide"><time dateTime={m.metAt}>{dateText.format(new Date(m.metAt))}</time></td>
                      <td className="admin-crud__wide">{m.confirmedBy ? fullName(m.confirmedBy) : <span className="admin-cell--null">Not recorded</span>}</td>
                      <td className="admin-crud__actions">
                        <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(m)} aria-label={`Edit the meetup for ${pairName(m.groups)}`}>
                          <Icon name="pencil" size={18} /><span className="admin-crud__btn-text">Edit</span>
                        </button>
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(m)} aria-label={`Delete the meetup for ${pairName(m.groups)}`}>
                          <Icon name="trash" size={18} /><span className="admin-crud__btn-text">Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && <MeetupFormSheet meetup={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />}
      {deleting && (
        <ConfirmSheet
          title="Delete this meetup?"
          confirmLabel="Delete meetup"
          busyLabel="Deleting…"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi(`/admin/meetups/${deleting.id}`, { method: 'DELETE' });
            setMeetups((list) => list.filter((m) => m.id !== deleting.id));
            toast(`Deleted the meetup for ${pairName(deleting.groups)}.`);
            setDeleting(null);
          }}
        >
          <p>
            {pairName(deleting.groups)} met up on {dateText.format(new Date(deleting.metAt))}. Deleting it
            means KR4 on the OKR Dashboard stops counting it, and both groups see “We met up!” in their chat
            again. This can't be undone.
          </p>
        </ConfirmSheet>
      )}
    </>
  );
}

// "Add meetup" (pick the match, the day, who confirmed it) and "Edit" (the day and who confirmed it;
// the match stays). Checked here first, then by the API; every message shows under its field.
function MeetupFormSheet({ meetup, onClose, onSaved }) {
  const isNew = !meetup;
  const [matches, setMatches] = useState(null); // every match, with who's in its chat
  const [loadError, setLoadError] = useState(null);
  // The form starts from the meetup as it is (initial), so an edit can send only what changed.
  const [initial] = useState(() => ({
    matchId: meetup ? String(meetup.matchId) : '',
    metOn: meetup ? localDay(meetup.metAt) : localDay(Date.now()),
    confirmedByUserId: meetup?.confirmedBy ? String(meetup.confirmedBy.id) : '',
  }));
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const idBase = useId();
  const id = (key) => `${idBase}-${key}`;

  useEffect(() => {
    let current = true;
    adminApi('/admin/meetups/matches')
      .then((data) => current && setMatches(data.matches))
      .catch((err) => current && setLoadError(err));
    return () => { current = false; };
  }, []);

  const title = isNew ? 'Add meetup' : `Edit the meetup for ${pairName(meetup.groups)}`;
  if (!matches) {
    return (
      <Sheet title={title} onClose={onClose}>
        {loadError ? <p className="form-error" role="alert">{friendlyError(loadError)}</p> : <Loader compact label="Loading matches…" />}
      </Sheet>
    );
  }

  const open = matches.filter((m) => !m.hasMeetup); // a match can have only one meetup
  const match = matches.find((m) => String(m.id) === v.matchId);
  const today = localDay(Date.now());
  // Who can be "confirmed by": the match's chat, plus (when editing) the current one if they've left it.
  const people = match?.people ?? [];
  const leftChat = meetup?.confirmedBy && !people.some((p) => p.id === meetup.confirmedBy.id) ? meetup.confirmedBy : null;
  const earliest = match ? localDay(match.matchedAt) : undefined;

  const set = (key) => (e) => {
    const value = e.target.value;
    // A different match has different people, so "confirmed by" starts over.
    setV((old) => ({ ...old, [key]: value, ...(key === 'matchId' && { confirmedByUserId: '' }) }));
    if (errors[key]) setErrors(({ [key]: _gone, ...rest }) => rest);
  };

  // The same rules as the API, so most mistakes are caught before anything is sent.
  const check = () => {
    const found = {};
    if (isNew && !v.matchId) found.matchId = 'Choose which two groups met up.';
    if (!v.metOn) found.metOn = 'Choose the day they met up.';
    else if (v.metOn > today) found.metOn = "The meetup can't be in the future.";
    else if (earliest && v.metOn < earliest) found.metOn = `They matched on ${dateText.format(new Date(match.matchedAt))}, so they can't have met up before that.`;
    return found;
  };
  const focusFirst = (found) => {
    const first = ['matchId', 'metOn', 'confirmedByUserId'].find((k) => found[k]);
    if (first) document.getElementById(id(first))?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const found = check();
    if (Object.keys(found).length) {
      setErrors(found);
      const n = Object.keys(found).length;
      setFormError(new Error(n === 1 ? Object.values(found)[0] : `Fix the ${n} highlighted fields.`));
      focusFirst(found);
      return;
    }
    setBusy(true);
    try {
      const body = { metOn: v.metOn, confirmedByUserId: v.confirmedByUserId ? Number(v.confirmedByUserId) : null };
      // Editing sends only what changed, so an unchanged "confirmed by" who has since left the chat
      // (and so couldn't be chosen now) stays as it was.
      if (!isNew && v.metOn === initial.metOn) delete body.metOn;
      if (!isNew && v.confirmedByUserId === initial.confirmedByUserId) delete body.confirmedByUserId;
      const { meetup: next } = isNew
        ? await adminApi('/admin/meetups', { method: 'POST', body: { ...body, matchId: Number(v.matchId) } })
        : await adminApi(`/admin/meetups/${meetup.id}`, { method: 'PATCH', body });
      onSaved(next, isNew);
    } catch (err) {
      const found = err.details?.fields ?? {};
      setErrors(found);
      setFormError(err);
      focusFirst(found);
    } finally {
      setBusy(false);
    }
  };

  const describe = (key, hint) => ({
    id: id(key),
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${id(key)}-error` : hint ? `${id(key)}-hint` : undefined,
  });

  return (
    <Sheet title={title} onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} noValidate>
        <FormError error={formError} />
        {isNew ? (
          open.length === 0 ? (
            <p className="admin-note" role="status">Every match already has a meetup. Edit one of those instead.</p>
          ) : (
            <AdminField id={id('matchId')} label="Groups that met up" error={errors.matchId} hint="Only matches without a meetup are listed.">
              <select {...describe('matchId', true)} value={v.matchId} onChange={set('matchId')}>
                <option value="">Choose a match…</option>
                {open.map((m) => <option key={m.id} value={m.id}>{pairName(m.groups)}</option>)}
              </select>
            </AdminField>
          )
        ) : (
          <p className="admin-form-match"><Pair groups={meetup.groups} size={36} /><strong>{pairName(meetup.groups)}</strong></p>
        )}
        {(!isNew || open.length > 0) && (
          <>
            <AdminField id={id('metOn')} label="Met on" error={errors.metOn}>
              <input type="date" {...describe('metOn')} value={v.metOn} onChange={set('metOn')} max={today} min={earliest} />
            </AdminField>
            <AdminField id={id('confirmedByUserId')} label="Confirmed by (optional)" error={errors.confirmedByUserId}
              hint={match ? 'Someone from either group.' : 'Choose the match first.'}>
              <select {...describe('confirmedByUserId', true)} value={v.confirmedByUserId} onChange={set('confirmedByUserId')} disabled={!match}>
                <option value="">Not recorded</option>
                {leftChat && <option value={leftChat.id}>{fullName(leftChat)} (left the chat)</option>}
                {people.map((p) => <option key={p.id} value={p.id}>{fullName(p)} ({p.groupName})</option>)}
              </select>
            </AdminField>
            <button className="btn btn--primary btn--block" disabled={busy}>
              {busy && <Spinner size={18} />}
              {busy ? 'Saving…' : isNew ? 'Add meetup' : 'Save changes'}
            </button>
          </>
        )}
      </form>
    </Sheet>
  );
}
