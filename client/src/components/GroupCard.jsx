import { plural } from '../format.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

const MAX_OTHER_INTERESTS = 3;
const MAX_HERO_PHOTOS = 3;

// The card's hero: up to 3 members' real photos, each with alt text naming the person and group.
// With no uploaded photos yet, the placeholder is announced as one image ("no photos yet")
// instead of VoiceOver reading out "[Group photo]".
function GroupPhotos({ group }) {
  const withPhotos = group.members.filter((m) => m.photoUrl).slice(0, MAX_HERO_PHOTOS);
  if (!withPhotos.length) {
    return (
      <div className="gcard__photo" role="img" aria-label={`${group.name} has no photos yet`}>
        <span aria-hidden="true">[{group.photoLabel}]</span>
      </div>
    );
  }
  return (
    <div className={`gcard__photos gcard__photos--${withPhotos.length}`}>
      {withPhotos.map((m) => (
        <img key={m.id} src={m.photoUrl} alt={`${m.firstName}, a member of ${group.name}`} loading="lazy" />
      ))}
    </div>
  );
}

// The recommended-group card on Find.
export default function GroupCard({ group, position, total, onMemberClick }) {
  const { stats } = group;
  const shared = group.interests.filter((i) => i.shared);
  const others = group.interests.filter((i) => !i.shared).slice(0, MAX_OTHER_INTERESTS);
  const meta = [
    plural(group.memberCount, 'member'),
    stats && plural(stats.mutualFriends, 'mutual friend'),
    stats?.distanceMiles != null && `${stats.distanceMiles} mi away`,
  ].filter(Boolean);

  return (
    <article className="gcard" aria-label={group.name}>
      <div className="gcard__hero">
        <div className="gcard__hero-row">
          <span className="chip chip--location"><Icon name="pin" size={16} /> {group.city}</span>
          {total > 0 && <span className="gcard__counter">{position} of {total}</span>}
        </div>
        <GroupPhotos group={group} />
        {stats?.likesYou && <span className="gcard__likes-you">This group already wants to meet you</span>}
      </div>

      <div className="gcard__body">
        <h2 className="gcard__name">{group.name}</h2>
        <p className="gcard__location"><Icon name="pin" size={17} /> Located in {group.city}</p>
        <p className="gcard__meta">{meta.join(' · ')}</p>

        {(shared.length > 0 || others.length > 0) && (
          <div className="chips" aria-label="Interests">
            {shared.map((i) => (
              <span key={i.id} className="chip">
                <Icon name="check" size={16} strokeWidth={2.5} /> <span className="sr-only">Shared: </span>{i.name}
              </span>
            ))}
            {others.map((i) => (
              <span key={i.id} className="chip chip--gray">+ {i.name}</span>
            ))}
          </div>
        )}

        <h3 className="section-label">Members</h3>
        <div className="members">
          {group.members.map((m) => (
            <button key={m.id} type="button" className="member member--button" onClick={() => onMemberClick?.(m)} aria-label={`View ${m.firstName}'s profile`}>
              <Avatar initials={m.initials} color={m.avatarColor} size={42} src={m.photoUrl} />
              <div>
                <div className="member__name" title={m.firstName}>{m.firstName}</div>
                <div className="member__interests">{m.topInterests.join(' · ') || 'No interests yet'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
