import { useEffect, useId, useRef, useState } from 'react';
import { adminApi } from '../adminApi.js';
import { ConfirmSheet, fullName, LoadError, plural, useAdminData } from '../components/AdminCommon.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { Loader, LoadingStatus, Skeleton, Spinner } from '../components/Loading.jsx';
import { FormError, Sheet, useToast } from '../components/ui.jsx';
import { formatDay, GENDERS, RELATIONSHIP_LABELS } from '../format.js';
import { friendlyError } from '../friendlyError.js';

// Maintain Users (#/admin/users), in the admin portal (signed-in admins only): a table of every
// aura user with Add user, Edit and Delete. The API (server/src/routes/adminUsers.js) checks every
// field and names each problem; this page checks the same rules first, so most mistakes are caught
// before anything is sent, and shows each message under its field.

const LIMITS = { firstName: 50, lastName: 50, city: 80, bio: 500 };
const BLANK = { firstName: '', lastName: '', city: '', age: '', gender: '', relationshipStatus: '', bio: '' };

// The same rules as the API (and the app's own profile form), with the same wording.
function checkUser(v) {
  const errors = {};
  const text = (key, label, required) => {
    const value = v[key].trim();
    if (required && !value) errors[key] = `${label} can't be empty.`;
    else if (value.length > LIMITS[key]) errors[key] = `${label} must be ${LIMITS[key]} characters or fewer.`;
  };
  text('firstName', 'First name', true);
  text('lastName', 'Last name', true);
  text('city', 'City', true);
  text('bio', 'Bio', false);
  const age = v.age.trim();
  if (age && (!/^\d+$/.test(age) || Number(age) < 18 || Number(age) > 120)) {
    errors.age = 'Age must be a whole number between 18 and 120.';
  }
  return errors;
}

// The form's values for someone (empty strings for missing values, so every input stays controlled).
const formValue = (u) => ({
  firstName: u.firstName ?? '',
  lastName: u.lastName ?? '',
  city: u.city ?? '',
  age: u.age == null ? '' : String(u.age),
  gender: u.gender ?? '',
  relationshipStatus: u.relationshipStatus ?? '',
  bio: u.bio ?? '',
});

const byName = (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) || a.id - b.id;

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------
export function UsersPage() {
  const { data, error, reload } = useAdminData('/admin/users?limit=500');
  const [users, setUsers] = useState(null); // the table's rows; updated in place after add / edit / delete
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // 'new', or the row being edited
  const [deleting, setDeleting] = useState(null); // the row being deleted
  const searchId = useId();
  const toast = useToast();

  useEffect(() => { if (data) setUsers(data.users); }, [data]);

  const q = query.trim().toLowerCase();
  const shown = users?.filter((u) => !q || `${fullName(u)} ${u.city}`.toLowerCase().includes(q));

  const saved = (user, isNew) => {
    setUsers((list) => [...list.filter((u) => u.id !== user.id), user].sort(byName));
    setEditing(null);
    toast(isNew ? `Added ${fullName(user)}.` : `Saved ${fullName(user)}.`);
  };
  const deleted = (user) => {
    setUsers((list) => list.filter((u) => u.id !== user.id));
    setDeleting(null);
    toast(`Deleted ${fullName(user)}.`);
  };

  return (
    <>
      <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
      <div className="page-head admin-groups-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>Maintain Users</h1>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
          <Icon name="userPlus" size={20} />Add user
        </button>
      </div>
      <p className="admin-intro">
        Everyone with an aura profile. Add someone, fix their details, or delete their profile.
        People added here have a profile but no login yet.
      </p>

      <div className="field admin-search">
        <label className="field__label" htmlFor={searchId}>Search users</label>
        <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or city" autoComplete="off" />
      </div>

      {error && !users ? (
        <LoadError what="the users" error={error} onRetry={reload} />
      ) : !users ? (
        <>
          <div className="admin-table-wrap" aria-busy="true">
            <div className="admin-table-skeleton">
              {[1, 2, 3, 4, 5, 6].map((n) => <Skeleton key={n} text={16} width={`${92 - n * 5}%`} />)}
            </div>
          </div>
          <LoadingStatus label="Loading users…" />
        </>
      ) : (
        <>
          <p className="admin-count" role="status">
            {q ? `${plural(shown.length, 'user')} match “${query.trim()}”.` : `${plural(users.length, 'user')}.`}
          </p>
          {shown.length === 0 ? (
            <p className="admin-table-empty">{q ? 'No one matches that search.' : 'There are no users yet.'}</p>
          ) : (
            // On phones the less important columns are hidden (admin-users__wide), so the table fits.
            <div className="admin-table-wrap admin-users" role="region" aria-labelledby="admin-title" tabIndex={0}>
              <table className="admin-table">
                <caption className="sr-only">aura users, A to Z</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col" className="admin-users__wide">City</th>
                    <th scope="col" className="admin-users__wide">Age</th>
                    <th scope="col" className="admin-users__narrow">Groups</th>
                    <th scope="col" className="admin-users__wide">Login</th>
                    <th scope="col" className="admin-users__wide">Added</th>
                    <th scope="col" className="admin-users__actions"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => (
                    <tr key={u.id}>
                      <th scope="row" className="admin-users__rowhead">
                        <span className="admin-users__person">
                          <Avatar src={u.photoUrl} personId={u.id} color={u.avatarColor} size={36} />
                          <span className="admin-users__name">
                            {fullName(u)}
                            <span className="admin-users__sub">{u.city}</span>
                          </span>
                        </span>
                      </th>
                      <td className="admin-users__wide">{u.city}</td>
                      <td className="admin-users__wide">{u.age ?? <span className="admin-cell--null">–</span>}</td>
                      <td className="admin-users__narrow">{u.groupCount}</td>
                      <td className="admin-users__wide">{u.hasLogin ? 'Yes' : <span className="admin-cell--null">No</span>}</td>
                      <td className="admin-users__wide"><time dateTime={u.createdAt}>{formatDay(u.createdAt)}</time></td>
                      <td className="admin-users__actions">
                        <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(u)} aria-label={`Edit ${fullName(u)}`}>
                          <Icon name="pencil" size={18} /><span className="admin-users__btn-text">Edit</span>
                        </button>
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(u)} aria-label={`Delete ${fullName(u)}`}>
                          <Icon name="trash" size={18} /><span className="admin-users__btn-text">Delete</span>
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

      {editing && (
        <UserFormSheet
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {deleting && <DeleteUserSheet user={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------
// One labeled field with its error (or hint) and, for text with a limit, a "12/50" count under it.
// The error is tied to the input (aria-describedby), so screen readers read it with the field.
function AdminField({ id, label, error, hint, count, max, children }) {
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

function UserFormSheet({ user, onClose, onSaved }) {
  const isNew = !user;
  const [v, setV] = useState(isNew ? BLANK : null); // null while the edit form loads the full profile
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const idBase = useId();
  const id = (key) => `${idBase}-${key}`;

  // Editing: the table's row has no bio, so load the whole profile first.
  useEffect(() => {
    if (isNew) return undefined;
    let current = true;
    adminApi(`/admin/users/${user.id}`)
      .then((data) => current && setV(formValue(data.user)))
      .catch((err) => current && setLoadError(err));
    return () => { current = false; };
  }, [isNew, user]);

  // Typing in a field clears its error; the rest stay until the next try.
  const set = (key) => (e) => {
    setV({ ...v, [key]: e.target.value });
    if (errors[key]) setErrors(({ [key]: _gone, ...rest }) => rest);
  };
  const focusFirstError = (fieldErrors) => requestAnimationFrame(() => {
    const first = Object.keys(BLANK).find((key) => fieldErrors[key]);
    if (first) formRef.current?.querySelector(`#${CSS.escape(id(first))}`)?.focus();
  });

  const submit = async (e) => {
    e.preventDefault();
    const found = checkUser(v);
    setFormError(null);
    if (Object.keys(found).length) {
      setErrors(found);
      const n = Object.keys(found).length;
      setFormError(new Error(n === 1 ? Object.values(found)[0] : `Fix the ${n} highlighted fields.`));
      focusFirstError(found);
      return;
    }
    setBusy(true);
    try {
      const body = { ...v, age: v.age.trim() === '' ? null : Number(v.age) };
      const { user: next } = isNew
        ? await adminApi('/admin/users', { method: 'POST', body })
        : await adminApi(`/admin/users/${user.id}`, { method: 'PATCH', body });
      onSaved(next, isNew);
    } catch (err) {
      // The API's own checks, field by field (400 VALIDATION_ERROR with details.fields).
      const fieldErrors = err.details?.fields ?? {};
      setErrors(fieldErrors);
      setFormError(err);
      focusFirstError(fieldErrors);
    } finally {
      setBusy(false);
    }
  };

  const title = isNew ? 'Add user' : `Edit ${fullName(user)}`;
  if (!v) {
    return (
      <Sheet title={title} onClose={onClose}>
        {loadError ? <p className="form-error" role="alert">{friendlyError(loadError)}</p> : <Loader compact label="Loading their profile…" />}
      </Sheet>
    );
  }

  // Props shared by every input: its id, and which error or hint describes it.
  const inputProps = (key, hint) => ({
    id: id(key),
    value: v[key],
    onChange: set(key),
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${id(key)}-error` : hint ? `${id(key)}-hint` : undefined,
  });
  // Keep a value the list doesn't have (seed data says "Woman") as an option, so editing doesn't drop it.
  const genders = [...new Set([...GENDERS, v.gender].filter(Boolean))];

  return (
    <Sheet title={title} onClose={busy ? () => {} : onClose}>
      {/* noValidate: our own messages, under each field, instead of the browser's pop-ups */}
      <form onSubmit={submit} noValidate ref={formRef}>
        <FormError error={formError} />
        <p className="admin-form-note">First name, last name and city are required.</p>
        <div className="field-row">
          <AdminField id={id('firstName')} label="First name" error={errors.firstName} count={v.firstName.length} max={LIMITS.firstName}>
            <input {...inputProps('firstName')} maxLength={LIMITS.firstName} autoComplete="off" />
          </AdminField>
          <AdminField id={id('lastName')} label="Last name" error={errors.lastName} count={v.lastName.length} max={LIMITS.lastName}>
            <input {...inputProps('lastName')} maxLength={LIMITS.lastName} autoComplete="off" />
          </AdminField>
        </div>
        <AdminField id={id('city')} label="City" error={errors.city} count={v.city.length} max={LIMITS.city}>
          <input {...inputProps('city')} maxLength={LIMITS.city} placeholder="Provo, UT" autoComplete="off" />
        </AdminField>
        <div className="field-row">
          <AdminField id={id('age')} label="Age (optional)" error={errors.age} hint="18 to 120">
            <input {...inputProps('age', true)} inputMode="numeric" maxLength={3} autoComplete="off" />
          </AdminField>
          <AdminField id={id('gender')} label="Gender (optional)" error={errors.gender}>
            <select {...inputProps('gender')}>
              <option value="">Not set</option>
              {genders.map((g) => <option key={g}>{g}</option>)}
            </select>
          </AdminField>
        </div>
        <AdminField id={id('relationshipStatus')} label="Relationship status (optional)" error={errors.relationshipStatus}>
          <select {...inputProps('relationshipStatus')}>
            <option value="">Not set</option>
            {Object.entries(RELATIONSHIP_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </AdminField>
        <AdminField id={id('bio')} label="Bio (optional)" error={errors.bio} count={v.bio.length} max={LIMITS.bio}>
          <textarea {...inputProps('bio')} maxLength={LIMITS.bio} />
        </AdminField>
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy && <Spinner size={18} />}
          {busy ? 'Saving…' : isNew ? 'Add user' : 'Save changes'}
        </button>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
// Loads what deleting them would change (their groups, messages, likes) and says it before asking.
function DeleteUserSheet({ user, onClose, onDeleted }) {
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    let current = true;
    adminApi(`/admin/users/${user.id}`)
      .then((data) => current && setDetail(data.user))
      .catch((err) => current && setLoadError(err));
    return () => { current = false; };
  }, [user]);

  const name = fullName(user);
  if (!detail) {
    return (
      <Sheet title={`Delete ${name}?`} onClose={onClose}>
        {loadError ? <p className="form-error" role="alert">{friendlyError(loadError)}</p> : <Loader compact label="Checking what this affects…" />}
      </Sheet>
    );
  }

  const removed = [
    'their aura profile',
    detail.photoCount ? plural(detail.photoCount, 'photo') : null,
    detail.likeCount ? `the ${plural(detail.likeCount, 'Connect or Pass', 'Connects and Passes')} they made for groups` : null,
  ].filter(Boolean);
  const list = removed.length > 1 ? `${removed.slice(0, -1).join(', ')} and ${removed.at(-1)}` : removed[0];

  return (
    <ConfirmSheet
      title={`Delete ${name}?`}
      confirmLabel="Delete user"
      busyLabel="Deleting…"
      onClose={onClose}
      onConfirm={async () => {
        await adminApi(`/admin/users/${user.id}`, { method: 'DELETE' });
        onDeleted(user);
      }}
    >
      <p>This deletes {list}. It can't be undone.</p>
      {detail.groups.length > 0 && (
        <ul className="admin-consequences">
          {detail.groups.map((g) => (
            <li key={g.id}>
              <strong>{g.name}</strong>:{' '}
              {g.memberCount === 1
                ? 'deleted too, because nobody else is in it.'
                : g.nextOwner ? `${g.nextOwner} becomes the owner.` : 'they leave the group.'}
            </li>
          ))}
        </ul>
      )}
      {detail.messageCount > 0 && <p>Their {plural(detail.messageCount, 'message')} stay in the chats, shown as from a former member.</p>}
      {detail.hasLogin && <p>Their login isn't deleted. If they sign in again, the app asks them to set up a new profile.</p>}
    </ConfirmSheet>
  );
}
