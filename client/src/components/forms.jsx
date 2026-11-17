import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { GENDERS, RELATIONSHIP_LABELS, TRAIT_SUGGESTIONS } from '../format.js';
import Avatar from './Avatar.jsx';
import GroupPhotoField from './GroupPhotoField.jsx';
import Icon from './Icon.jsx';
import { PersonButton } from './ProfileViewer.jsx';
import { Loader } from './Loading.jsx';
import { Field, FormError, useAsyncAction } from './ui.jsx';

// Profile fields (no photos/interests): used by Edit profile and onboarding.
export function ProfileFields({ value, onChange }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const toggleTrait = (trait) => {
    const has = value.personalityTraits.includes(trait);
    if (!has && value.personalityTraits.length >= 5) return;
    onChange({
      ...value,
      personalityTraits: has ? value.personalityTraits.filter((t) => t !== trait) : [...value.personalityTraits, trait],
    });
  };
  return (
    <>
      <div className="field-row">
        <Field label="First name"><input value={value.firstName} onChange={set('firstName')} maxLength={50} required /></Field>
        <Field label="Last name"><input value={value.lastName} onChange={set('lastName')} maxLength={50} required /></Field>
      </div>
      <Field label="City"><input value={value.city} onChange={set('city')} maxLength={80} required /></Field>
      <Field label="Bio">
        <textarea value={value.bio} onChange={set('bio')} maxLength={500} placeholder="What's something about you? What are you into?" />
      </Field>
      <div className="field-row">
        <Field label="Age"><input type="number" inputMode="numeric" min={18} max={120} value={value.age} onChange={set('age')} /></Field>
        <Field label="Gender">
          <select value={value.gender} onChange={set('gender')}>
            <option value="">Choose…</option>
            {[...new Set([...GENDERS, value.gender].filter(Boolean))].map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Relationship status">
        <select value={value.relationshipStatus} onChange={set('relationshipStatus')}>
          <option value="">Choose…</option>
          {Object.entries(RELATIONSHIP_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </Field>
      <div className="field">
        <span className="field__label">Personality (up to 5)</span>
        <div className="chips">
          {[...new Set([...TRAIT_SUGGESTIONS, ...value.personalityTraits])].map((t) => (
            <button key={t} type="button" className="chip chip--toggle" aria-pressed={value.personalityTraits.includes(t)} onClick={() => toggleTrait(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export const profileFormValue = (user) => ({
  firstName: user.firstName ?? '',
  lastName: user.lastName ?? '',
  city: user.city ?? '',
  bio: user.bio ?? '',
  age: user.age ?? '',
  gender: user.gender ?? '',
  relationshipStatus: user.relationshipStatus ?? '',
  personalityTraits: user.personalityTraits ?? [],
});

export const profilePatch = (v) => ({
  firstName: v.firstName,
  lastName: v.lastName,
  city: v.city,
  bio: v.bio,
  age: v.age === '' ? null : Number(v.age),
  gender: v.gender || null,
  relationshipStatus: v.relationshipStatus || null,
  personalityTraits: v.personalityTraits,
});

export function EditProfileForm({ me, onSaved }) {
  const [value, setValue] = useState(() => profileFormValue(me.user));
  const { busy, error, run } = useAsyncAction();
  const submit = (e) => {
    e.preventDefault();
    run(async () => onSaved(await api('/me', { method: 'PATCH', body: profilePatch(value) })));
  };
  return (
    <form onSubmit={submit}>
      <FormError error={error} />
      <ProfileFields value={value} onChange={setValue} />
      <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  );
}

// "+ Add" interest: type a new one or pick from existing interests.
export function AddInterestForm({ current, onAdd }) {
  const [all, setAll] = useState([]);
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false); // 8 suggestions, then "More"
  const { busy, error, run } = useAsyncAction();
  useEffect(() => {
    api('/interests').then((d) => setAll(d.interests)).catch(() => {});
  }, []);
  const have = new Set(current.map((i) => i.name.toLowerCase()));
  const q = text.trim().toLowerCase();
  const suggestions = all.filter((i) => !have.has(i.name.toLowerCase()) && (!q || i.name.toLowerCase().includes(q)));
  const add = (name) => run(() => onAdd(name));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (q) add(text.trim()); }}>
      <FormError error={error} />
      <Field label="Interest">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Pickleball" maxLength={40} />
      </Field>
      <div className="chips" style={{ marginBottom: 16 }}>
        {suggestions.slice(0, showAll || q ? 30 : 8).map((i) => (
          <button key={i.id} type="button" className="chip chip--gray" disabled={busy} onClick={() => add(i.name)}>
            + {i.name}
          </button>
        ))}
        {!showAll && !q && suggestions.length > 8 && (
          <button type="button" className="chip chip--dashed" onClick={() => setShowAll(true)}>More</button>
        )}
      </div>
      <button className="btn btn--primary btn--block" disabled={busy || !q}>
        {busy ? 'Adding…' : q ? `Add "${text.trim()}"` : 'Type or pick an interest'}
      </button>
    </form>
  );
}

// Create a new group or join one with an invite code.
export const GROUP_NAME_MAX = 60;
export const GROUP_CITY_MAX = 80;

// What people type or paste as an invite: the code ("summit 77") or the whole invite link
// (".../#/join?code=SUMMIT77"). Returns just the code, upper case, without spaces or dashes.
export function readInviteCode(text) {
  const fromLink = text.match(/[?&]code=([^&#\s]+)/i);
  const raw = fromLink ? decodeURIComponent(fromLink[1]) : text;
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

// A text input with its own label, a live "12/60" count and an error under it.
function TextField({ id, label, value, onChange, max, error, placeholder, hint }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <div className="field__foot">
        {error ? <span id={`${id}-error`} className="field__error">{error}</span> : hint && <span id={`${id}-hint`} className="field__hint">{hint}</span>}
        {max && <span className="field__count" aria-hidden="true">{value.length}/{max}</span>}
      </div>
    </div>
  );
}

// Create a new group or join one with an invite code.
export function CreateOrJoinForm({ onDone, defaultTab = 'create', defaultInviteCode = '', joinOnly = false }) {
  const [tab, setTab] = useState(defaultTab);
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => readInviteCode(defaultInviteCode));
  const [fieldError, setFieldError] = useState(null);
  const { busy, error, setError, run } = useAsyncAction();
  const submit = (e) => {
    e.preventDefault();
    // Checked here first so the message sits under the field; the server checks the same things.
    const invalid = tab === 'create'
      ? !name.trim() && 'Give your group a name.'
      : !code ? 'Enter the invite code your friend sent you.'
        : !/^[A-Z0-9]{4,12}$/.test(code) && 'Invite codes are 4 to 12 letters and numbers, like SUMMIT77.';
    setFieldError(invalid || null);
    if (invalid) return;
    run(async () => {
      const res = tab === 'create'
        ? await api('/groups', { method: 'POST', body: { name: name.trim() } })
        : await api('/groups/join', { method: 'POST', body: { inviteCode: code } });
      await onDone(res.group, tab);
    });
  };
  const switchTab = (t) => {
    setTab(t);
    setError(null);
    setFieldError(null);
  };
  // A wrong or unknown code is about the field, so show it there too.
  const codeError = fieldError ?? (['INVITE_NOT_FOUND', 'INVALID_INVITE_CODE'].includes(error?.code) ? error.message : null);
  return (
    <form onSubmit={submit} noValidate>
      {!joinOnly && <div className="tabs" role="tablist">
        {['create', 'join'].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => switchTab(t)}>
            {t === 'create' ? 'Create a group' : 'Join with code'}
          </button>
        ))}
      </div>}
      {codeError && tab === 'join' ? <p className="sr-only" role="alert">{codeError}</p> : <FormError error={error} />}
      {tab === 'create' ? (
        <TextField
          id="new-group-name"
          label="Group name"
          value={name}
          onChange={(v) => { setName(v); setFieldError(null); }}
          max={GROUP_NAME_MAX}
          error={fieldError}
          placeholder="e.g. Tuesday Crew"
        />
      ) : (
        <TextField
          id="invite-code"
          label="Invite code"
          value={code}
          onChange={(v) => { setCode(readInviteCode(v)); setFieldError(null); setError(null); }}
          error={codeError}
          placeholder="e.g. SUMMIT77"
          hint="Ask a friend in the group for its code, or paste their invite link."
        />
      )}
      <button className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'One sec…' : tab === 'create' ? 'Create group' : 'Join group'}
      </button>
    </form>
  );
}

export function InviteFriends({ group: initialGroup, onChanged }) {
  // Kept here so "n of 10" and the full notice update as you add people.
  const [group, setGroup] = useState(initialGroup);
  useEffect(() => setGroup(initialGroup), [initialGroup]);
  const [friends, setFriends] = useState(null);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const full = group.memberCount >= (group.maxMembers ?? 10);
  useEffect(() => {
    api('/me/friends').then((d) => setFriends(d.friends)).catch(() => setFriends([]));
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const inviteLink = `${window.location.origin}${window.location.pathname}#/join?code=${encodeURIComponent(group.inviteCode)}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const add = (friend) => run(async () => {
    const res = await api(`/groups/${group.id}/members`, { method: 'POST', body: { userId: friend.id } });
    setFriends((fs) => fs.map((f) => (f.id === friend.id ? { ...f, groupIds: [...f.groupIds, group.id] } : f)));
    setGroup((g) => ({ ...g, ...res.group }));
    await onChanged(res.group);
  });
  return (
    <div>
      <p className="subtle" style={{ marginTop: 0 }}>Share this link or code. Friends can open the link to join directly.</p>
      {full && (
        <p className="group-full" role="status">
          <Icon name="users" size={18} />
          <span><strong>{group.name}</strong> is full (10 of 10). A group can have at most 10 members, so remove someone before adding anyone new.</span>
        </p>
      )}
      <div className="invite-code">
        <span className="invite-code__value">{group.inviteCode}</span>
        <div className="invite-code__actions">
        <button type="button" className="btn btn--sm btn--outline" onClick={copyLink}>
          <Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Copied link' : 'Copy link'}
        </button>
        <button type="button" className="btn btn--sm btn--outline" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={18} /> {copied ? 'Copied' : 'Copy'}
        </button>
        </div>
      </div>
      <h3 className="section-label">Or add a friend directly · {group.memberCount} of 10</h3>
      <FormError error={error} />
      {friends === null && <Loader label="Loading friends…" compact />}
      {friends?.length === 0 && <p className="muted-small">No friends yet.</p>}
      {friends?.map((f) => {
        // The group's own member list is current (someone may have just been removed); the friends
        // list is from when this opened.
        const inGroup = group.members ? group.members.some((m) => m.id === f.id) : f.groupIds.includes(group.id);
        return (
          <div key={f.id} className="person-row">
            <PersonButton person={f} groupId={inGroup ? group.id : f.groupIds[0]}>
              <Avatar initials={f.initials} color={f.avatarColor} size={40} src={f.photoUrl} personId={f.id} />
            </PersonButton>
            <span className="person-row__name">{f.firstName} {f.lastName}</span>
            {inGroup ? (
              <span className="muted-small">In group</span>
            ) : (
              <button
                type="button"
                className="btn btn--sm btn--soft"
                disabled={busy || full}
                aria-label={`Add ${f.firstName} ${f.lastName}`}
                onClick={() => add(f)}
              >
                Add
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Manage group: details (name, city), group photo, members (remove, add), leave.
// Details save with "Save changes"; everything else saves as you do it and keeps the sheet open
// (onChanged refreshes the rest of the app).
export function ManageGroupForm({ group, myId, onSaved, onLeft, onChanged }) {
  const [name, setName] = useState(group.name);
  const [city, setCity] = useState(group.city ?? '');
  const [fieldErrors, setFieldErrors] = useState({});
  const [currentGroup, setCurrentGroup] = useState(group);
  const details = useAsyncAction();
  const members = useAsyncAction();
  const isOwner = group.role === 'owner';
  const max = currentGroup.maxMembers ?? 10;

  const update = async (updated) => {
    setCurrentGroup((g) => ({ ...g, ...updated }));
    await onChanged?.();
  };
  const save = (e) => {
    e.preventDefault();
    const errors = {};
    if (!name.trim()) errors.name = "Group name can't be empty.";
    if (!city.trim()) errors.city = "City can't be empty.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      document.getElementById(errors.name ? 'group-name' : 'group-city')?.focus();
      return;
    }
    details.run(async () => onSaved((await api(`/groups/${group.id}`, { method: 'PATCH', body: { name: name.trim(), city: city.trim() } })).group));
  };
  const leave = () => {
    // The server hands the group to its longest-standing member when the owner leaves.
    const nextOwner = isOwner && currentGroup.members.find((m) => m.id !== myId);
    const lastOne = currentGroup.memberCount <= 1;
    const message = lastOne
      ? `Leave ${currentGroup.name}? You're its only member, so the group will be deleted.`
      : `Leave ${currentGroup.name}?${nextOwner ? ` ${nextOwner.firstName} ${nextOwner.lastName} will become the owner.` : ''}`;
    if (!window.confirm(message)) return;
    members.run(async () => {
      await api(`/groups/${group.id}/members/me`, { method: 'DELETE' });
      await onLeft();
    });
  };
  const remove = (member) => {
    if (!window.confirm(`Remove ${member.firstName} ${member.lastName} from ${currentGroup.name}?`)) return;
    members.run(async () => {
      const updated = await api(`/groups/${currentGroup.id}/members/${member.id}`, { method: 'DELETE' });
      await update(updated.group);
    });
  };

  return (
    <div className="manage-group">
      <form onSubmit={save} noValidate>
        <FormError error={details.error} />
        <TextField
          id="group-name"
          label="Group name"
          value={name}
          onChange={(v) => { setName(v); setFieldErrors((f) => ({ ...f, name: null })); }}
          max={GROUP_NAME_MAX}
          error={fieldErrors.name}
        />
        <TextField
          id="group-city"
          label="City"
          value={city}
          onChange={(v) => { setCity(v); setFieldErrors((f) => ({ ...f, city: null })); }}
          max={GROUP_CITY_MAX}
          error={fieldErrors.city}
          placeholder="e.g. Provo, UT"
          hint="Find shows groups in the same city first."
        />
        <button className="btn btn--primary btn--block" disabled={details.busy}>{details.busy ? 'Saving…' : 'Save changes'}</button>
      </form>

      <GroupPhotoField group={currentGroup} canEdit={isOwner} onChanged={update} />

      <section aria-labelledby="manage-members">
        <h3 id="manage-members" className="section-label">Members · {currentGroup.memberCount} of {max}</h3>
        <FormError error={members.error} />
        {currentGroup.members.map((m) => (
          <div key={m.id} className="person-row">
            <PersonButton person={m} groupId={currentGroup.id}>
              <Avatar initials={m.initials} color={m.avatarColor} size={40} src={m.photoUrl} personId={m.id} />
            </PersonButton>
            <span className="person-row__name">{m.firstName} {m.lastName}{m.id === myId && <span className="muted-small"> (you)</span>}</span>
            {m.role === 'owner' && <span className="badge">Owner</span>}
            {isOwner && m.role !== 'owner' && (
              <button
                type="button"
                className="btn btn--sm btn--danger-outline"
                disabled={members.busy}
                aria-label={`Remove ${m.firstName} ${m.lastName}`}
                onClick={() => remove(m)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!isOwner && <p className="muted-small">Only the group's owner can remove members.</p>}
      </section>

      <section aria-labelledby="manage-add">
        <h3 id="manage-add" className="section-label">Add members</h3>
        <InviteFriends group={currentGroup} onChanged={update} />
      </section>

      <button type="button" className="btn btn--danger btn--block manage-group__leave" disabled={members.busy} onClick={leave}>
        Leave group
      </button>
    </div>
  );
}
