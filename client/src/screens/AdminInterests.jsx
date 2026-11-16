import { useEffect, useId, useState } from 'react';
import { adminApi } from '../adminApi.js';
import { AdminField, ConfirmSheet, LoadError, plural, useAdminData } from '../components/AdminCommon.jsx';
import Icon from '../components/Icon.jsx';
import { LoadingStatus, Skeleton, Spinner } from '../components/Loading.jsx';
import { FormError, Sheet, useToast } from '../components/ui.jsx';

// Maintain Interests (#/admin/interests), in the admin portal (signed-in admins only): a table of every
// interest with Add, Edit and Delete. The API (server/src/routes/adminInterests.js) enforces the
// rules; this page checks them first so mistakes show up under the field straight away.
// Custom interests (typed by someone on their profile) aren't in everyone's interest picker until
// enough people have them; Edit can add one to it sooner.

const MAX = 40; // interests.name is varchar(40)
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id;
// Names match without regard to case or spacing, like the API.
const nameKey = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

export function InterestsPage() {
  const { data, error, reload } = useAdminData('/admin/interests');
  const [interests, setInterests] = useState(null); // the table's rows; updated in place after each change
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // 'new', or the interest being renamed
  const [deleting, setDeleting] = useState(null);
  const searchId = useId();
  const toast = useToast();

  useEffect(() => { if (data) setInterests(data.interests); }, [data]);

  const q = query.trim().toLowerCase();
  const shown = interests?.filter((i) => !q || i.name.toLowerCase().includes(q));

  const threshold = data?.pickerThreshold ?? 10;

  const saved = (interest, isNew) => {
    setInterests((list) => [...list.filter((i) => i.id !== interest.id), interest].sort(byName));
    setEditing(null);
    toast(isNew ? `Added “${interest.name}”.` : `Saved “${interest.name}”.`);
  };

  return (
    <>
      <a href="#/admin" className="admin-back"><Icon name="chevronLeft" size={20} />Admin portal</a>
      <div className="page-head admin-groups-head">
        <h1 id="admin-title" className="page-title" tabIndex={-1}>Maintain Interests</h1>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
          <Icon name="plus" size={20} />Add interest
        </button>
      </div>
      <p className="admin-intro">
        The interests people can pick for their profile. A group's interests come from its members',
        so a rename or delete shows up on every profile and group card at once.
      </p>
      <p className="admin-intro">
        <strong>Custom</strong> ones were typed by someone on their profile. They're on those profiles,
        but they join everyone's interest picker only once {threshold} people have them, or when you add one with Edit.
      </p>

      <div className="field admin-search">
        <label className="field__label" htmlFor={searchId}>Search interests</label>
        <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name" autoComplete="off" />
      </div>

      {error && !interests ? (
        <LoadError what="the interests" error={error} onRetry={reload} />
      ) : !interests ? (
        <>
          <div className="admin-table-wrap" aria-busy="true">
            <div className="admin-table-skeleton">{[1, 2, 3, 4, 5].map((n) => <Skeleton key={n} text={16} width={`${80 - n * 8}%`} />)}</div>
          </div>
          <LoadingStatus label="Loading interests…" />
        </>
      ) : (
        <>
          <p className="admin-count" role="status">
            {q ? `${plural(shown.length, 'interest')} match “${query.trim()}”.` : `${plural(interests.length, 'interest')}.`}
          </p>
          {shown.length === 0 ? (
            <p className="admin-table-empty">{q ? 'No interest matches that search.' : 'There are no interests yet.'}</p>
          ) : (
            <div className="admin-table-wrap admin-crud" role="region" aria-labelledby="admin-title" tabIndex={0}>
              <table className="admin-table">
                <caption className="sr-only">Interests, A to Z, with how many people and groups have each and whether everyone can pick it</caption>
                <thead>
                  <tr>
                    <th scope="col">Interest</th>
                    <th scope="col" className="admin-crud__narrow">People</th>
                    <th scope="col" className="admin-crud__narrow admin-crud__wide">Groups</th>
                    <th scope="col" className="admin-crud__narrow admin-crud__wide">Picker</th>
                    <th scope="col" className="admin-crud__actions"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id}>
                      <th scope="row" className="admin-crud__rowhead">
                        <span className="admin-crud__name">
                          {i.name}
                          <span className="admin-crud__sub">{plural(i.groupCount, 'group')}{!i.inPicker && ' · Custom'}</span>
                        </span>
                      </th>
                      <td className="admin-crud__narrow">{i.userCount}</td>
                      <td className="admin-crud__narrow admin-crud__wide">{i.groupCount}</td>
                      <td className="admin-crud__narrow admin-crud__wide">{i.inPicker ? 'Everyone' : 'Custom'}</td>
                      <td className="admin-crud__actions">
                        <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                          <Icon name="pencil" size={18} /><span className="admin-crud__btn-text">Edit</span>
                        </button>
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(i)} aria-label={`Delete ${i.name}`}>
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

      {editing && (
        <InterestFormSheet
          interest={editing === 'new' ? null : editing}
          others={interests.filter((i) => editing === 'new' || i.id !== editing.id)}
          threshold={threshold}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {deleting && (
        <ConfirmSheet
          title={`Delete “${deleting.name}”?`}
          confirmLabel="Delete interest"
          busyLabel="Deleting…"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi(`/admin/interests/${deleting.id}`, { method: 'DELETE' });
            setInterests((list) => list.filter((i) => i.id !== deleting.id));
            toast(`Deleted “${deleting.name}”.`);
            setDeleting(null);
          }}
        >
          {deleting.userCount === 0 ? (
            <p>Nobody has picked it, so no profile changes. This can't be undone.</p>
          ) : (
            <>
              <p>
                It comes off the profiles of the {plural(deleting.userCount, 'person', 'people')} who picked it
                {deleting.groupCount > 0 && `, so ${plural(deleting.groupCount, 'group')} stop showing it`}. This can't be undone.
              </p>
              {deleting.onlyInterestCount > 0 && (
                <p>
                  {deleting.onlyInterestCount === 1 ? '1 of them has' : `${deleting.onlyInterestCount} of them have`} no other
                  interest, so the app will ask them to add one before they can carry on.
                </p>
              )}
            </>
          )}
        </ConfirmSheet>
      )}
    </>
  );
}

// "Add interest" and "Edit": the name, checked here (blank, too long, already taken in any
// capitalization or spacing) and again by the API, whose messages show under the field the same way.
// Editing a custom interest also offers to add it to everyone's picker now.
function InterestFormSheet({ interest, others, threshold, onClose, onSaved }) {
  const isNew = !interest;
  const [name, setName] = useState(interest?.name ?? '');
  const [addToPicker, setAddToPicker] = useState(false);
  const [error, setError] = useState(null); // the message under the field
  const [formError, setFormError] = useState(null); // anything else (network, server)
  const [busy, setBusy] = useState(false);
  const id = useId();

  const check = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return "Name can't be empty.";
    if (trimmed.length > MAX) return `Name must be ${MAX} characters or fewer.`;
    const taken = others.find((i) => nameKey(i.name) === nameKey(trimmed));
    if (taken) return `There's already an interest called “${taken.name}”.`;
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const problem = check(name);
    setError(problem);
    if (problem) {
      document.getElementById(id)?.focus();
      return;
    }
    setBusy(true);
    try {
      const { interest: next } = isNew
        ? await adminApi('/admin/interests', { method: 'POST', body: { name } })
        : await adminApi(`/admin/interests/${interest.id}`, { method: 'PATCH', body: { name, ...(addToPicker && { inPicker: true }) } });
      onSaved(next, isNew);
    } catch (err) {
      // A name problem (400, or 409 "already an interest called ...") goes under the field.
      if (err.details?.fields?.name) {
        setError(err.details.fields.name);
        document.getElementById(id)?.focus();
      } else setFormError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={isNew ? 'Add interest' : `Edit “${interest.name}”`} onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} noValidate>
        <FormError error={formError} />
        <AdminField id={id} label="Name" error={error} count={name.length} max={MAX}
          hint={isNew ? "It goes straight into everyone's interest picker." : undefined}>
          <input
            id={id} value={name} maxLength={MAX} autoComplete="off" placeholder="Board games"
            onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : isNew ? `${id}-hint` : undefined}
          />
        </AdminField>
        {interest && !interest.inPicker && (
          <div className="admin-check">
            <label className="admin-check__row">
              <input type="checkbox" checked={addToPicker} onChange={(e) => setAddToPicker(e.target.checked)} aria-describedby={`${id}-picker-hint`} />
              <span>Add to everyone's interest picker now</span>
            </label>
            <p id={`${id}-picker-hint`} className="admin-check__hint">
              It's custom: {plural(interest.userCount, 'person has', 'people have')} it, and it joins by itself at {threshold}.
              Once it's in, it stays in unless you delete it.
            </p>
          </div>
        )}
        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy && <Spinner size={18} />}
          {busy ? 'Saving…' : isNew ? 'Add interest' : 'Save'}
        </button>
      </form>
    </Sheet>
  );
}
