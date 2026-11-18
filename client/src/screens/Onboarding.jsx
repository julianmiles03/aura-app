import { useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import PhotoGrid from '../components/PhotoGrid.jsx';
import { AddInterestForm, CreateOrJoinForm, InviteFriends, ProfileFields, profileFormValue, profilePatch } from '../components/forms.jsx';
import { FormError, useAsyncAction } from '../components/ui.jsx';

// What a complete profile needs, as a checklist that ticks off as you go (server: getOnboarding in
// server/src/lib/profile.js). `section` is where on this page to fill it in.
const CHECKLIST = [
  { label: 'A photo', todo: 'add a photo', fields: ['photos'], section: 'setup-photos' },
  { label: 'An interest', todo: 'add an interest', fields: ['interests'], section: 'setup-interests' },
  { label: 'A short bio', todo: 'write a short bio', fields: ['bio'], section: 'setup-about' },
  { label: 'Age, gender and relationship status', todo: 'fill in your age, gender and relationship status', fields: ['age', 'gender', 'relationshipStatus'], section: 'setup-about' },
  { label: 'A personality trait', todo: 'pick a personality trait', fields: ['personalityTraits'], section: 'setup-about' },
];

// What's still missing right now: photos and interests save as soon as they're added, so they come
// from the server; the About you fields come from the form, so they tick as you type.
function liveMissing(value, me) {
  const missing = [];
  if (me.photos.length < 1) missing.push('photos');
  if (me.interests.length < 1) missing.push('interests');
  if (!value.bio.trim()) missing.push('bio');
  if (value.age === '' || !Number(value.age)) missing.push('age');
  if (!value.gender) missing.push('gender');
  if (!value.relationshipStatus) missing.push('relationshipStatus');
  if (value.personalityTraits.length < 1) missing.push('personalityTraits');
  return missing;
}

const listText = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

// Step 1: build the profile (rule 1).
export function ProfileSetup({ me, setMe, refreshMe }) {
  const [value, setValue] = useState(() => profileFormValue(me.user));
  const { busy, error, run } = useAsyncAction();
  // Set when Save is pressed with things still to do; cleared once they're all done.
  const [showTodo, setShowTodo] = useState(false);
  const missing = liveMissing(value, me);
  const todo = CHECKLIST.filter((item) => item.fields.some((f) => missing.includes(f)));

  const addInterest = async (name) => {
    setMe(await api('/me', { method: 'PATCH', body: { interests: [...me.interests.map((i) => i.name), name] } }));
  };
  const save = (e) => {
    e.preventDefault();
    // Save what's there either way, so nothing typed is lost; the server decides when the profile is complete.
    run(async () => {
      const next = await api('/me', { method: 'PATCH', body: profilePatch(value) });
      setShowTodo(!next.onboarding.profileComplete);
      setMe(next);
    });
  };

  return (
    <main className="gate">
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

      <section className="card setup-section" id="setup-photos" tabIndex={-1}>
        <h2 className="card__title">Photos</h2>
        <p className="hint photos__intro">A main photo, plus up to 3 more.</p>
        <PhotoGrid photos={me.photos} ownerName={me.user.firstName} ownerId={me.user.id} avatarColor={me.user.avatarColor} onChanged={refreshMe} />
      </section>

      <section className="card setup-section" id="setup-interests" tabIndex={-1}>
        <h2 className="card__title">Interests</h2>
        {me.interests.length > 0 && (
          <div className="chips" style={{ marginBottom: 14 }}>
            {me.interests.map((i) => <span key={i.id} className="chip">{i.name}</span>)}
          </div>
        )}
        <AddInterestForm current={me.interests} onAdd={addInterest} />
      </section>

      <section className="card setup-section" id="setup-about" tabIndex={-1}>
        <h2 className="card__title">About you</h2>
        <form onSubmit={save}>
          <FormError error={error} />
          <ProfileFields value={value} onChange={setValue} />
          {showTodo && todo.length > 0 && (
            <div className="setup-todo" role="alert">
              <p>Saved. To finish your profile, {listText(todo.map((item) => item.todo))}.</p>
              <ul>
                {todo.filter((item) => item.section !== 'setup-about').map((item) => (
                  <li key={item.label}>
                    <button type="button" className="link-btn" onClick={() => goTo(item.section)}>
                      Go to {item.section === 'setup-photos' ? 'Photos' : 'Interests'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
          {!showTodo && todo.length > 0 && (
            <p className="hint setup-hint">Still to do: {listText(todo.map((item) => item.label.toLowerCase()))}.</p>
          )}
        </form>
      </section>
    </main>
  );
}

// Step 2: rule 1 again. No group = no app, with an invitation to create or join one.
export function NoGroupGate({ refreshMe, inviteCode = '' }) {
  const [createdGroup, setCreatedGroup] = useState(null);
  if (createdGroup) {
    return (
      <main className="gate">
        <div className="steps" role="img" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>
        <h1 className="page-title" style={{ fontSize: 34 }}>Invite your friends</h1>
        <p className="subtle">Your group is ready. Share its code so your friends can join before you start finding other groups.</p>
        <section className="card">
          <InviteFriends group={createdGroup} onChanged={setCreatedGroup} />
          <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 18 }} onClick={refreshMe}>Continue to aura</button>
        </section>
      </main>
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
    <main className="gate">
      <div className="steps" role="img" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>
      <h1 className="page-title" style={{ fontSize: 34 }}>{inviteCode ? 'Join your friend group' : 'One more thing'}</h1>
      <div className="gate-error" role="alert" style={{ marginTop: 16 }}>
        <Icon name="users" />
        <span>You need to be in a friend group before you can use aura. Create one for your crew, or join one with an invite code from a friend.</span>
      </div>
      <section className="card">
        <CreateOrJoinForm defaultTab={inviteCode ? 'join' : 'create'} defaultInviteCode={inviteCode} joinOnly={Boolean(inviteCode)} onDone={onDone} />
      </section>
    </main>
  );
}

export function JoinGroupScreen({ refreshMe, inviteCode }) {
  const joinDone = async () => {
    await refreshMe();
    window.location.hash = '#/find';
  };
  return (
    <main className="gate">
      <h1 className="page-title" style={{ fontSize: 34 }}>Join your friend group</h1>
      <p className="subtle">Enter the invite code your friend shared, then you’ll be ready to find groups together.</p>
      <section className="card"><CreateOrJoinForm defaultTab="join" defaultInviteCode={inviteCode} joinOnly onDone={joinDone} /></section>
    </main>
  );
}
