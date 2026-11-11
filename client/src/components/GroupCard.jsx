import { plural } from '../format.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { illustratedAvatar } from '../illustrated.js';

const MAX_INTERESTS = 3; // the rest collapse into "+N"
const MAX_HERO_PHOTOS = 3;

// The card's hero: the group photo if the owner uploaded one, otherwise up to 3 members' pictures
// (their main photo, or their illustrated avatar), each with alt text naming the person and group.
function GroupPhotos({ group }) {
  if (group.photoUrl) {
    return (
      <div className="gcard__photos gcard__photos--1">
        <img src={group.photoUrl} alt={`${group.name}'s group photo`} loading="lazy" />
      </div>
    );
  }
  const shown = [...group.members].sort((a, b) => Boolean(b.photoUrl) - Boolean(a.photoUrl)).slice(0, MAX_HERO_PHOTOS);
  return (
    <div className={`gcard__photos gcard__photos--${shown.length}`}>
      {shown.map((m) => (
        <img key={m.id} src={m.photoUrl ?? illustratedAvatar(m.id, m.avatarColor)} alt={`${m.firstName}, a member of ${group.name}`} loading="lazy" />
      ))}
    </div>
  );
}

// The recommended-group card on Find. Kept short so the whole card (photos, name, place,
// top interests, members) fits above Pass / Connect on a 390px-wide phone.
export default function GroupCard({ group, position, total, onMemberClick }) {
  const { stats } = group;
  // Shared interests first, then the others; 3 shown, the rest as "+N".
  const interests = [...group.interests.filter((i) => i.shared), ...group.interests.filter((i) => !i.shared)];
  const shown = interests.slice(0, MAX_INTERESTS);
  const hidden = interests.length - shown.length;
  const meta = [
    plural(group.memberCount, 'member'),
    stats?.mutualFriends > 0 && plural(stats.mutualFriends, 'mutual friend'),
  ].filter(Boolean);
  const place = [group.city, stats?.distanceMiles != null && `${stats.distanceMiles} mi away`].filter(Boolean).join(' · ');

  return (
    <article className="gcard" aria-label={group.name}>
      <div className="gcard__hero">
        <GroupPhotos group={group} />
        {total > 0 && <span className="gcard__counter">{position} of {total}</span>}
        {stats?.likesYou && <span className="gcard__likes-you">Wants to meet you</span>}
      </div>

      <div className="gcard__body">
        <h2 className="gcard__name">{group.name}</h2>
        <p className="gcard__location"><Icon name="pin" size={17} /> <span><span className="sr-only">Located in </span>{place}</span></p>
        <p className="gcard__meta">{meta.join(' · ')}</p>

        {shown.length > 0 && (
          <div className="chips chips--compact" aria-label="Interests">
            {shown.map((i) => (
              <span key={i.id} className={`chip ${i.shared ? '' : 'chip--gray'}`}>
                {i.shared && <Icon name="check" size={15} strokeWidth={2.5} />}
                {i.shared && <span className="sr-only">Shared: </span>}{i.name}
              </span>
            ))}
            {hidden > 0 && <span className="chip chip--gray" aria-label={`${hidden} more interests`}>+{hidden}</span>}
          </div>
        )}

        <div className="members-row" role="group" aria-label="Members">
          {group.members.map((m) => (
            <button key={m.id} type="button" className="members-row__item" onClick={() => onMemberClick?.(m)} aria-label={`View ${m.firstName}'s profile`}>
              <Avatar initials={m.initials} color={m.avatarColor} size={44} src={m.photoUrl} personId={m.id} />
              <span className="members-row__name" aria-hidden="true">{m.firstName}</span>
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
