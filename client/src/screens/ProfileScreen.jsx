import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar, { AvatarStack } from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PhotoGrid from '../components/PhotoGrid.jsx';
import {
  AddInterestForm, CreateOrJoinForm, EditProfileForm, InviteFriends, ManageGroupForm,
} from '../components/forms.jsx';
import { Sheet, useToast } from '../components/ui.jsx';
import { RELATIONSHIP_LABELS } from '../format.js';

export default function ProfileScreen({ me, setMe, refreshMe, onSwitchGroup, onSignOut }) {
  const toast = useToast();
  const [sheet, setSheet] = useState(null); // { type, group? }
  const close = () => setSheet(null);
  const { user, photos, interests } = me;

  const saveInterests = async (names) => {
    const updated = await api('/me', { method: 'PATCH', body: { interests: names } });
    setMe(updated);
    return updated;
  };
  const addInterest = async (name) => {
    await saveInterests([...interests.map((i) => i.name), name]);
    toast(`Added ${name}.`);
  };
  const removeInterest = async (interest) => {
    try {
      await saveInterests(interests.filter((i) => i.id !== interest.id).map((i) => i.name));
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  // About me in one line, e.g. "21 · Woman · Single · Outgoing, Planner".
  const details = [
    user.age, user.gender, RELATIONSHIP_LABELS[user.relationshipStatus], user.personalityTraits.join(', '),
  ].filter(Boolean).join(' · ');

  return (
    <div className="screen screen--profile">
      <header className="page-head">
        <h1 className="page-title">Profile</h1>
        <button type="button" className="icon-btn" aria-label="Edit profile settings" onClick={() => setSheet({ type: 'edit' })}>
          <Icon name="sliders" />
        </button>
      </header>

      <div className="profile-columns">
        <div className="profile-col">
          <section className="card">
            <PhotoGrid photos={photos} ownerName={user.firstName} ownerId={user.id} avatarColor={user.avatarColor} onChanged={refreshMe}>
              <div className="profile-top">
                <div className="profile-top__info">
                  <h2 className="profile-top__name">{user.firstName} {user.lastName}</h2>
                  <div className="subtle">{user.city}</div>
                </div>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => setSheet({ type: 'edit' })}>Edit</button>
              </div>
              {details && <p className="profile-details">{details}</p>}
              {user.bio && <p className="profile-bio">{user.bio}</p>}
            </PhotoGrid>
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Interests</h2>
              <button type="button" className="link-btn" onClick={() => setSheet({ type: 'interest' })}>Edit</button>
            </div>
            <div className="chips chips--compact">
              {interests.map((i) => <span key={i.id} className="chip">{i.name}</span>)}
            </div>
          </section>

        </div>

        <div className="profile-col">
          <div className="mygroups-head">
            <h2>My groups</h2>
            <button type="button" className="btn btn--dark btn--sm" onClick={() => setSheet({ type: 'createJoin' })}>Create or join</button>
          </div>

          {me.groups.map((g) => (
            <MyGroupCard
              key={g.id}
              group={g}
              onSwitch={() => onSwitchGroup(g.id)}
              onInvite={() => setSheet({ type: 'invite', group: g })}
              onManage={() => setSheet({ type: 'manage', group: g })}
            />
          ))}

          <button type="button" className="btn btn--outline btn--block profile-signout" onClick={onSignOut}>Log out</button>
        </div>
      </div>

      {sheet?.type === 'edit' && (
        <Sheet title="Edit profile" onClose={close}>
          <EditProfileForm me={me} onSaved={(updated) => { setMe(updated); close(); toast('Profile saved.'); }} />
        </Sheet>
      )}
      {sheet?.type === 'interest' && (
        <Sheet title="Your interests" onClose={close}>
          <div className="chips" style={{ marginBottom: 18 }}>
            {interests.map((i) => (
              <span key={i.id} className="chip">
                {i.name}
                {interests.length > 1 && (
                  <button type="button" className="chip__remove" aria-label={`Remove ${i.name}`} onClick={() => removeInterest(i)}>
                    <Icon name="x" size={14} strokeWidth={2.5} />
                  </button>
                )}
              </span>
            ))}
          </div>
          <AddInterestForm current={interests} onAdd={addInterest} />
          <p className="hint">Your groups' shared interests update too.</p>
        </Sheet>
      )}
      {sheet?.type === 'createJoin' && (
        <Sheet title="Create or join" onClose={close}>
          <CreateOrJoinForm
            onDone={async (group, tab) => {
              await refreshMe();
              close();
              toast(tab === 'create' ? `Created ${group.name}. It's now your active group.` : `You joined ${group.name}.`);
            }}
          />
        </Sheet>
      )}
      {sheet?.type === 'invite' && (
        <Sheet title={`Invite to ${sheet.group.name}`} onClose={close}>
          <InviteFriends group={sheet.group} onChanged={refreshMe} />
        </Sheet>
      )}
      {sheet?.type === 'manage' && (
        <Sheet title="Manage group" onClose={close}>
          <ManageGroupForm
            group={sheet.group}
            onSaved={async () => { await refreshMe(); close(); toast('Group updated.'); }}
            onPhotoChanged={refreshMe}
            onLeft={async () => { close(); await refreshMe(); toast(`You left ${sheet.group.name}.`); }}
          />
        </Sheet>
      )}
    </div>
  );
}

// One of your groups: tap the card to manage it; "…" has Invite friends and Make active.
function MyGroupCard({ group, onSwitch, onInvite, onManage }) {
  const [menu, setMenu] = useState(false);
  const moreRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => !moreRef.current?.contains(e.target) && setMenu(false);
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const topInterests = group.interests.slice(0, 3).map((i) => i.name).join(', ');
  return (
    <section className={`card mygroup ${group.isActive ? 'mygroup--active' : ''}`} aria-label={group.name}>
      <button type="button" className="mygroup__main" onClick={onManage} aria-label={`Manage ${group.name}`}>
        <Avatar initials={group.initials} color={group.avatarColor} size={52} shape="square" solid={group.isActive} src={group.photoUrl} />
        <span className="mygroup__text">
          <span className="mygroup__name">{group.name} {group.isActive && <span className="badge">Active</span>}</span>
          <span className="mygroup__meta">
            {group.memberCount} of 10 members · {group.isFull ? 'Group is full' : topInterests || 'No interests yet'}
          </span>
        </span>
      </button>
      <div className="mygroup__more" ref={moreRef}>
        <button type="button" className="icon-btn icon-btn--plain" aria-label={`More for ${group.name}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <Icon name="more" />
        </button>
        {menu && (
          <div className="menu menu--right" role="menu">
            {!group.isFull && <button type="button" role="menuitem" className="menu__item" onClick={() => { setMenu(false); onInvite(); }}>Invite friends</button>}
            {!group.isActive && <button type="button" role="menuitem" className="menu__item" onClick={() => { setMenu(false); onSwitch(); }}>Make active group</button>}
            <button type="button" role="menuitem" className="menu__item" onClick={() => { setMenu(false); onManage(); }}>Manage group</button>
          </div>
        )}
      </div>
      <div className="mygroup__people"><AvatarStack people={group.members} max={7} size={30} /></div>
    </section>
  );
}
