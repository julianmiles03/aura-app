import { useEffect, useId, useRef, useState } from 'react';
import { adminApi } from '../adminApi.js';
import { ConfirmSheet, fullName, LoadError, plural, useAdminData } from '../components/AdminCommon.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { Loader, LoadingStatus, Skeleton, Spinner } from '../components/Loading.jsx';
import { Field, FormError, Sheet, useAsyncAction, useToast } from '../components/ui.jsx';
import { formatDay } from '../format.js';
import { friendlyError } from '../friendlyError.js';

// Maintain Groups, in the admin portal (signed-in admins only):
//   #/admin/groups      every group, a search box and "New group"
//   #/admin/groups/:id  one group: edit its name and city, add / remove members, choose the owner,
//                       delete the group
// The API (server/src/routes/adminGroups.js) enforces every rule; the page only makes them visible:
// it shows "7 of 10", turns "Add member" off at 10, and says why before something is deleted.


// "7 of 10" with a small bar. The bar is decoration; the words carry the meaning.
function MemberMeter({ count, max }) {
  const full = count >= max;
  return (
    <span className={`admin-meter${full ? ' admin-meter--full' : ''}`}>
      <span className="admin-meter__text">
        {count} of {max}<span className="sr-only"> members</span>{full && <span className="admin-meter__full">Full</span>}
      </span>
      <span className="admin-meter__bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (count / max) * 100)}%` }} /></span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// #/admin/groups: the list
// ---------------------------------------------------------------------------
export function GroupsPage() {
  const { data, error, reload } = useAdminData('/admin/groups');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const searchId = useId();
  const q = query.trim().toLowerCase();
  // Every group is already loaded (there are only dozens), so the search filters on the page.
  const groups = data?.groups.filter((g) => !q
    || `${g.name} ${g.city} ${g.owner ? fullName(g.owner) : ''}`.toLowerCase().includes(q));

  return (
    <>
      <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
      <div className="page-head admin-groups-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>Maintain Groups</h1>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={20} />New group
        </button>
      </div>
      <p className="admin-intro">
        Create, edit and delete friend groups, and choose who's in them. Every group has one owner and
        at most 10 members.
      </p>

      <div className="field admin-search">
        <label className="field__label" htmlFor={searchId}>Search groups</label>
        <input
          id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, city or owner" autoComplete="off"
        />
      </div>

      {error && !data ? (
        <LoadError what="the groups" error={error} onRetry={reload} />
      ) : !data ? (
        <>
          <ul className="admin-group-list" aria-busy="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n}>
                <div className="admin-group-row">
                  <Skeleton width={48} height={48} radius={14} />
                  <span className="admin-group-row__text"><Skeleton text={17} width="60%" /><Skeleton text={14} width="45%" /></span>
                </div>
              </li>
            ))}
          </ul>
          <LoadingStatus label="Loading groups…" />
        </>
      ) : (
        <>
          <p className="admin-count" role="status">
            {q ? `${plural(groups.length, 'group')} match “${query.trim()}”.` : `${plural(data.groups.length, 'group')}.`}
          </p>
          {groups.length === 0 ? (
            <p className="admin-table-empty">{q ? 'No group matches that search.' : 'There are no groups yet.'}</p>
          ) : (
            <ul className="admin-group-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <a href={`#/admin/groups/${g.id}`} className="admin-group-row">
                    <Avatar initials={g.initials} color={g.avatarColor} size={48} shape="square" src={g.photoUrl} />
                    <span className="admin-group-row__text">
                      <span className="admin-group-row__name">{g.name}</span>
                      <span className="admin-group-row__meta">
                        {g.city} · {g.owner ? `Owner: ${fullName(g.owner)}` : 'No owner'}
                      </span>
                    </span>
                    <MemberMeter count={g.memberCount} max={g.maxMembers} />
                    <Icon name="chevronRight" size={20} className="admin-group-row__go" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {creating && <NewGroupSheet onClose={() => setCreating(false)} />}
    </>
  );
}

// "New group": name, city and the owner, who becomes its first member.
function NewGroupSheet({ onClose }) {
  const [v, setV] = useState({ name: '', city: '' });
  const [owner, setOwner] = useState(null);
  // "Choose who owns the group." shows in the Owner section itself: on a phone the sheet is scrolled
  // down to the Create button, so a message at the top of the form would be out of sight.
  const [ownerError, setOwnerError] = useState(null);
  const ownerRef = useRef(null);
  const ownerErrorId = useId();
  const { busy, error, run } = useAsyncAction();
  const toast = useToast();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (!owner) {
      setOwnerError('Choose who owns the group.');
      ownerRef.current?.querySelector('input')?.focus(); // focusing the search box scrolls it into view
      return;
    }
    run(async () => {
      const { group } = await adminApi('/admin/groups', { method: 'POST', body: { ...v, ownerUserId: owner.id } });
      toast(`Created ${group.name}.`);
      window.location.hash = `#/admin/groups/${group.id}`; // straight on to adding members
    });
  };
  return (
    <Sheet title="New group" onClose={onClose}>
      <form onSubmit={submit}>
        <FormError error={error} />
        <Field label="Group name">
          <input value={v.name} onChange={set('name')} required maxLength={60} autoComplete="off" />
        </Field>
        <Field label="City">
          <input value={v.city} onChange={set('city')} required maxLength={80} placeholder="Provo" autoComplete="off" />
        </Field>
        <fieldset className="admin-owner" ref={ownerRef} aria-describedby={ownerError ? ownerErrorId : undefined}>
          <legend className="field__label">Owner</legend>
          <p className="admin-owner__hint">The owner is the group's first member. You can add more people next.</p>
          {ownerError && <p id={ownerErrorId} className="field__error admin-owner__error" role="alert">{ownerError}</p>}
          {owner ? (
            <div className="admin-person admin-person--chosen">
              <Avatar src={owner.photoUrl} personId={owner.id} color={owner.avatarColor} size={40} />
              <span className="admin-person__text">
                <span className="admin-person__name">{fullName(owner)}</span>
                <span className="admin-person__meta">{owner.city}</span>
              </span>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setOwner(null)}>
                Change<span className="sr-only"> owner</span>
              </button>
            </div>
          ) : (
            <UserPicker actionLabel="Choose" onPick={(person) => { setOwner(person); setOwnerError(null); }} />
          )}
        </fieldset>
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy && <Spinner size={18} />}{busy ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </Sheet>
  );
}

// Search for people by name and pick one ("Choose" for the owner, "Add" for members). With a
// groupId, people already in that group show "In this group" instead of a button. memberIds (the
// group's members as the page has them) makes someone show as in the group the moment they're
// added, without waiting for the search to reload.
function UserPicker({ groupId, actionLabel, onPick, busyId = null, refreshKey = 0, memberIds }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ users: null, error: null });
  const inputId = useId();

  useEffect(() => {
    let current = true;
    // Wait for a pause in typing before asking the API (and don't wait at all for the first load).
    const timer = setTimeout(() => {
      adminApi(`/admin/users?q=${encodeURIComponent(q.trim())}${groupId ? `&groupId=${groupId}` : ''}`)
        .then((data) => current && setState({ users: data.users, error: null }))
        .catch((error) => current && setState((s) => ({ users: s.users, error })));
    }, q ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [q, groupId, refreshKey]);

  return (
    <div className="admin-picker">
      <div className="field">
        <label className="field__label" htmlFor={inputId}>Search people</label>
        <input
          id={inputId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="First or last name"
          autoComplete="off" onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); /* don't submit the form */ }}
        />
      </div>
      {state.error && <p className="form-error" role="alert">{friendlyError(state.error)}</p>}
      <p className="sr-only" role="status">{state.users ? `${plural(state.users.length, 'person', 'people')} found.` : ''}</p>
      {!state.users ? (
        <Loader compact label="Loading people…" />
      ) : state.users.length === 0 ? (
        <p className="admin-picker__none">No one matches “{q.trim()}”.</p>
      ) : (
        <>
          <ul className="admin-people">
            {state.users.map((u) => (
              <li key={u.id} className="admin-person">
                <Avatar src={u.photoUrl} personId={u.id} color={u.avatarColor} size={40} />
                <span className="admin-person__text">
                  <span className="admin-person__name">{fullName(u)}</span>
                  <span className="admin-person__meta">{u.city} · {plural(u.groupCount, 'group')}</span>
                </span>
                {u.inGroup || memberIds?.has(u.id) ? (
                  <span className="badge">In this group</span>
                ) : (
                  <button type="button" className="btn btn--soft btn--sm" onClick={() => onPick(u)} disabled={busyId !== null}>
                    {busyId === u.id && <Spinner size={18} />}
                    {actionLabel}<span className="sr-only"> {fullName(u)}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
          {state.users.length === 20 && <p className="admin-picker__none">Showing the first 20. Type a name to find someone else.</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// #/admin/groups/:id: one group
// ---------------------------------------------------------------------------
export function GroupPage({ id }) {
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  // Every change answers with the whole group, so the page just shows the newest copy.
  useEffect(() => {
    let current = true;
    setError(null);
    adminApi(`/admin/groups/${id}`)
      .then((data) => current && setGroup(data.group))
      .catch((err) => current && setError(err));
    return () => { current = false; };
  }, [id, attempt]);

  useEffect(() => {
    if (group) document.title = `${group.name} · Maintain Groups · aura`;
  }, [group]);

  const back = <a href="#/admin/groups" className="admin-back"><Icon name="chevronLeft" size={20} />Maintain Groups</a>;

  if (error && !group) {
    return (
      <>
        {back}
        {error.code === 'GROUP_NOT_FOUND' ? (
          <div className="empty">
            <h1 id="admin-title" tabIndex={-1}>No such group</h1>
            <p>This group doesn't exist. It may have been deleted.</p>
            <a href="#/admin/groups" className="btn btn--primary">See all groups</a>
          </div>
        ) : <LoadError what="this group" error={error} onRetry={() => setAttempt((n) => n + 1)} />}
      </>
    );
  }

  if (!group) {
    return (
      <>
        {back}
        <div className="admin-group-head" aria-busy="true">
          <Skeleton width={56} height={56} radius={17} />
          <span className="admin-group-head__text"><Skeleton text={30} width={220} /><Skeleton text={15} width={260} /></span>
        </div>
        <Loader label="Loading the group…" />
      </>
    );
  }

  return (
    <>
      {back}
      <div className="admin-group-head">
        <Avatar initials={group.initials} color={group.avatarColor} size={56} shape="square" src={group.photoUrl} />
        <div className="admin-group-head__text">
          <h1 id="admin-title" className="page-title" tabIndex={-1}>{group.name}</h1>
          <p className="admin-group-head__meta">
            {group.city} · Created {formatDay(group.createdAt)} · Invite code <code>{group.inviteCode}</code>
          </p>
        </div>
      </div>
      <div className="admin-group-grid">
        <DetailsCard group={group} onSaved={setGroup} />
        <MembersCard group={group} onChange={setGroup} />
        <DeleteCard group={group} />
      </div>
    </>
  );
}

function DetailsCard({ group, onSaved }) {
  const [v, setV] = useState({ name: group.name, city: group.city });
  const { busy, error, run } = useAsyncAction();
  const toast = useToast();
  // A save (or anything else) that changes the group on the server refills the form.
  useEffect(() => { setV({ name: group.name, city: group.city }); }, [group.name, group.city]);
  const changed = v.name.trim() !== group.name || v.city.trim() !== group.city;
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { group: saved } = await adminApi(`/admin/groups/${group.id}`, { method: 'PATCH', body: v });
      onSaved(saved);
      toast('Saved.');
    });
  };
  return (
    <section className="card admin-card admin-card--details" aria-labelledby="group-details-title">
      <h2 id="group-details-title" className="admin-card__title">Details</h2>
      <form onSubmit={submit}>
        <FormError error={error} />
        <Field label="Group name">
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={60} autoComplete="off" />
        </Field>
        <Field label="City">
          <input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} required maxLength={80} autoComplete="off" />
        </Field>
        <button className="btn btn--primary btn--block" disabled={busy || !changed}>
          {busy && <Spinner size={18} />}{busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </section>
  );
}

function MembersCard({ group, onChange }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null); // the member the confirm sheet asks about
  const [promoting, setPromoting] = useState(null); // user id while "Make owner" is saving
  const toast = useToast();
  const onlyOne = group.memberCount === 1;

  const makeOwner = async (m) => {
    setPromoting(m.id);
    try {
      const { group: next } = await adminApi(`/admin/groups/${group.id}/members/${m.id}`, { method: 'PATCH', body: { role: 'owner' } });
      onChange(next);
      toast(`${fullName(m)} is now the owner.`);
    } catch (err) {
      toast(friendlyError(err), { tone: 'error' });
    } finally {
      setPromoting(null);
    }
  };

  // Who takes over if the owner is removed: the longest-standing of the others (same rule as the API).
  const nextOwner = (leaving) => group.members
    .filter((m) => m.id !== leaving.id)
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt) || a.id - b.id)[0];

  return (
    <section className="card admin-card admin-card--members" aria-labelledby="group-members-title">
      <div className="admin-card__head">
        <h2 id="group-members-title" className="admin-card__title">Members</h2>
        <MemberMeter count={group.memberCount} max={group.maxMembers} />
      </div>

      {group.isFull && (
        <p className="group-full">
          <Icon name="users" size={18} />
          <span>{group.name} is full ({group.maxMembers} of {group.maxMembers}). Remove someone before adding another person.</span>
        </p>
      )}
      <button type="button" className="btn btn--soft btn--block" onClick={() => setAdding(true)} disabled={group.isFull}>
        <Icon name="userPlus" size={20} />Add member
      </button>

      <ul className="admin-members">
        {group.members.map((m) => (
          <li key={m.id} className="admin-member">
            <Avatar src={m.photoUrl} personId={m.id} color={m.avatarColor} size={44} />
            <span className="admin-member__text">
              <span className="admin-member__name">
                {fullName(m)}{m.role === 'owner' && <span className="badge admin-member__owner">Owner</span>}
              </span>
              <span className="admin-member__meta">
                {m.city} · Joined {formatDay(m.joinedAt)}{m.isActiveGroup && ' · Acting as this group'}
              </span>
            </span>
            <span className="admin-member__actions">
              {m.role !== 'owner' && (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => makeOwner(m)} disabled={promoting !== null}>
                  {promoting === m.id && <Spinner size={16} />}Make owner<span className="sr-only">: {fullName(m)}</span>
                </button>
              )}
              <button type="button" className="btn btn--danger btn--sm" onClick={() => setRemoving(m)} disabled={onlyOne}>
                Remove<span className="sr-only"> {fullName(m)}</span>
              </button>
            </span>
          </li>
        ))}
      </ul>
      {onlyOne && (
        <p className="admin-note">A group can't be empty, so its only member can't be removed. To get rid of it, delete the group.</p>
      )}

      {adding && <AddMemberSheet group={group} onAdded={onChange} onClose={() => setAdding(false)} />}
      {removing && (
        <ConfirmSheet
          title={`Remove ${fullName(removing)}?`}
          confirmLabel="Remove"
          busyLabel="Removing…"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const { group: next } = await adminApi(`/admin/groups/${group.id}/members/${removing.id}`, { method: 'DELETE' });
            onChange(next);
            toast(`Removed ${fullName(removing)}.`);
            setRemoving(null);
          }}
        >
          <p>
            {fullName(removing)} leaves {group.name} and its group chats.
            {removing.role === 'owner' && ` ${fullName(nextOwner(removing))} becomes the owner, as the longest-standing member.`}
            {removing.isActiveGroup && ' They were acting as this group, so the app switches them to another of their groups.'}
          </p>
        </ConfirmSheet>
      )}
    </section>
  );
}

// "Add member": search, then Add. The sheet stays open to add several people, until the group is full.
function AddMemberSheet({ group, onAdded, onClose }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(0); // reloads the search, so each person's group count is current
  // "Added Ben Kim." inside the sheet (one line, replaced each time), not a pile of toasts.
  const [lastAdded, setLastAdded] = useState(null);
  const add = async (user) => {
    setBusyId(user.id);
    setError(null);
    try {
      const { group: next } = await adminApi(`/admin/groups/${group.id}/members`, { method: 'POST', body: { userId: user.id } });
      onAdded(next);
      setAdded((n) => n + 1);
      setLastAdded(fullName(user));
    } catch (err) {
      setError(err); // 409 GROUP_FULL if someone else filled the last place first
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Sheet title={`Add to ${group.name}`} onClose={onClose}>
      <div className="admin-sheet-meta">
        <MemberMeter count={group.memberCount} max={group.maxMembers} />
        <p className="admin-sheet-meta__added" role="status">{lastAdded && <><Icon name="check" size={16} strokeWidth={2.5} />Added {lastAdded}.</>}</p>
      </div>
      <FormError error={error} />
      {group.isFull ? (
        <>
          <p className="group-full" role="status">
            <Icon name="check" size={18} /><span>{group.name} is full now ({group.maxMembers} of {group.maxMembers}).</span>
          </p>
          <button type="button" className="btn btn--primary btn--block" onClick={onClose}>Done</button>
        </>
      ) : (
        <UserPicker
          groupId={group.id} actionLabel="Add" onPick={add} busyId={busyId} refreshKey={added}
          memberIds={new Set(group.members.map((m) => m.id))}
        />
      )}
    </Sheet>
  );
}

function DeleteCard({ group }) {
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  // Everything the database deletes along with the group (ON DELETE CASCADE), spelled out.
  const what = [
    plural(group.memberCount, 'membership'),
    group.matchCount ? `${plural(group.matchCount, 'match', 'matches')} and their chats (${plural(group.messageCount, 'message')})` : null,
    group.likeCount ? plural(group.likeCount, 'Connect or Pass', 'Connects and Passes') : null,
  ].filter(Boolean);
  const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what.at(-1)}` : what[0];

  return (
    <section className="card admin-card admin-card--danger" aria-labelledby="group-delete-title">
      <h2 id="group-delete-title" className="admin-card__title">Delete group</h2>
      <p className="admin-note">Deleting {group.name} also deletes its {list}. This can't be undone.</p>
      <button type="button" className="btn btn--danger btn--block" onClick={() => setConfirming(true)}>
        <Icon name="trash" size={20} />Delete group
      </button>
      {confirming && (
        <ConfirmSheet
          title={`Delete ${group.name}?`}
          confirmLabel="Delete group"
          busyLabel="Deleting…"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await adminApi(`/admin/groups/${group.id}`, { method: 'DELETE' });
            toast(`Deleted ${group.name}.`);
            window.location.hash = '#/admin/groups';
          }}
        >
          <p>This also deletes its {list}. Members who were acting as this group switch to another of their groups. This can't be undone.</p>
        </ConfirmSheet>
      )}
    </section>
  );
}
