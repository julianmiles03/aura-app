import { useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import PhotoGrid from '../components/PhotoGrid.jsx';
import { AddInterestForm, CreateOrJoinForm, InviteFriends, ProfileFields, profileFormValue, profilePatch } from '../components/forms.jsx';
import { FormError, useAsyncAction } from '../components/ui.jsx';

// What a complete profile needs, as a checklist that ticks off as you go (server: me.onboarding.missing).
const CHECKLIST = [
  { label: 'A photo', fields: ['photos'] },
  { label: 'An interest', fields: ['interests'] },
  { label: 'A short bio', fields: ['bio'] },
  { label: 'Age, gender and relationship status', fields: ['age', 'gender', 'relationshipStatus'] },
  { label: 'A personality trait', fields: ['personalityTraits'] },
];

// Step 1: build the profile (rule 1).
export function ProfileSetup({ me, setMe, refreshMe }) {
  const [value, setValue] = useState(() => profileFormValue(me.user));
  const { busy, error, run } = useAsyncAction();
  const missing = me.onboarding.missing;

  const addInterest = async (name) => {
    setMe(await api('/me', { method: 'PATCH', body: { interests: [...me.interests.map((i) => i.name), name] } }));
  };
  const save = (e) => {
    e.preventDefault();
    run(async () => setMe(await api('/me', { method: 'PATCH', body: profilePatch(value) })));
  };

  return (
    <div className="gate">
      <div className="steps" role="img" aria-label="Step 1 of 2"><span className="on" /><span /></div>
      <h1 className="page-title" style={{ fontSize: 34 }}>Build your profile</h1>
      <p className="subtle">This profile is about you. Groups come next.</p>
      <ul className="checklist" aria-label="Your profile checklist">
        {CHECKLIST.map((item) => {
          const done = item.fields.every((f) => !missing.includes(f));
          return (
            <li key={item.label} className={done ? 'checklist__done' : ''}>
              <span className="checklist__box" aria-hidden="true">{done && <Icon name="check" size={14} strokeWidth={3} />}</span>
              {item.label}<span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
            </li>
          );
        })}
      </ul>

      <section className="card">
        <h2 className="card__title">Photos</h2>
        <p className="hint photos__intro">A main photo, plus up to 3 more.</p>
        <PhotoGrid photos={me.photos} ownerName={me.user.firstName} ownerId={me.user.id} avatarColor={me.user.avatarColor} onChanged={refreshMe} />
      </section>

      <section className="card">
        <h2 className="card__title">Interests</h2>
        {me.interests.length > 0 && (
          <div className="chips" style={{ marginBottom: 14 }}>
            {me.interests.map((i) => <span key={i.id} className="chip">{i.name}</span>)}
          </div>
        )}
        <AddInterestForm current={me.interests} onAdd={addInterest} />
      </section>

      <section className="card">
        <h2 className="card__title">About you</h2>
        <form onSubmit={save}>
          <FormError error={error} />
          <ProfileFields value={value} onChange={setValue} />
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </form>
      </section>
    </div>
  );
}

// Step 2: rule 1 again. No group = no app, with an invitation to create or join one.
export function NoGroupGate({ refreshMe, inviteCode = '' }) {
  const [createdGroup, setCreatedGroup] = useState(null);
  if (createdGroup) {
    return (
      <div className="gate">
        <div className="steps" role="img" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>
        <h1 className="page-title" style={{ fontSize: 34 }}>Invite your friends</h1>
        <p className="subtle">Your group is ready. Share the code or link before you start finding other groups.</p>
        <section className="card">
          <InviteFriends group={createdGroup} onChanged={setCreatedGroup} />
          <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 18 }} onClick={refreshMe}>Continue to aura</button>
        </section>
      </div>
    );
  }
  const onDone = async (group, tab) => {
    // After creating a group, show the invite screen first. Refreshing `me` now would
    // leave onboarding (the user has a group), so "Continue to aura" does it instead.
    if (tab === 'create') return setCreatedGroup(group);
    await refreshMe();
    window.location.hash = '#/find';
  };
  return (
    <div className="gate">
      <div className="steps" role="img" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>
      <h1 className="page-title" style={{ fontSize: 34 }}>{inviteCode ? 'Join your friend group' : 'One more thing'}</h1>
      <div className="gate-error" role="alert" style={{ marginTop: 16 }}>
        <Icon name="users" />
        <span>You need to be in a friend group before you can use aura. Create one for your crew, or join one with an invite code from a friend.</span>
      </div>
      <section className="card">
        <CreateOrJoinForm defaultTab={inviteCode ? 'join' : 'create'} defaultInviteCode={inviteCode} joinOnly={Boolean(inviteCode)} onDone={onDone} />
      </section>
    </div>
  );
}

export function JoinGroupScreen({ refreshMe, inviteCode }) {
  const joinDone = async () => {
    await refreshMe();
    window.location.hash = '#/find';
  };
  return (
    <div className="gate">
      <h1 className="page-title" style={{ fontSize: 34 }}>Join your friend group</h1>
      <p className="subtle">Use the invite link your friend shared, then you’ll be ready to find groups together.</p>
      <section className="card"><CreateOrJoinForm defaultTab="join" defaultInviteCode={inviteCode} joinOnly onDone={joinDone} /></section>
    </div>
  );
}
