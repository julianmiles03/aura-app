import { illustratedAvatar } from '../illustrated.js';
import { RELATIONSHIP_LABELS } from '../format.js';

export default function MemberProfile({ profile }) {
  // Main photo (position 1) big on top, or their illustrated avatar; always 3 slots under it
  // (photos 2-4), so the "main photo + 3 more" layout reads the same on everyone's profile.
  // A slot they haven't filled says "No photo yet".
  const [main, ...rest] = profile.photos ?? [];
  const slots = Array.from({ length: 3 }, (_, i) => rest[i] ?? null);
  const details = [
    profile.age && `${profile.age} years old`,
    profile.gender,
    RELATIONSHIP_LABELS[profile.relationshipStatus],
  ].filter(Boolean);
  return (
    <div className="member-profile">
      <img
        className="member-profile__main"
        src={main?.imageUrl ?? illustratedAvatar(profile.id, profile.avatarColor)}
        alt={main?.imageUrl ? `${profile.firstName}'s main photo` : `${profile.firstName}'s illustrated avatar`}
      />
      <div className="member-profile__who">
        <h3>{profile.firstName} {profile.lastName}</h3>
        <p className="subtle">{profile.city}</p>
      </div>
      <div className="photos member-profile__photos" role="group" aria-label={`${profile.firstName}'s other photos`}>
        {slots.map((photo, i) => (
          photo?.imageUrl ? (
            <div key={photo.id} className="photo">
              <img className="photo__img" src={photo.imageUrl} alt={`${profile.firstName}'s photo ${i + 2}`} loading="lazy" />
            </div>
          ) : (
            <div key={photo?.id ?? `empty-${i}`} className="photo photo--none" role="img" aria-label={`Photo ${i + 2}: no photo yet`}>
              <span className="photo__empty" aria-hidden="true">No photo yet</span>
            </div>
          )
        ))}
      </div>
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      {details.length > 0 && <p className="gcard__meta">{details.join(' · ')}</p>}
      {profile.interests?.length > 0 && (
        <div className="chips" aria-label="Interests">
          {profile.interests.map((interest) => <span key={interest} className="chip">{interest}</span>)}
        </div>
      )}
      {profile.personalityTraits?.length > 0 && (
        <>
          <h4 className="section-label">Personality</h4>
          <div className="chips">
            {profile.personalityTraits.map((trait) => <span key={trait} className="chip chip--gray">{trait}</span>)}
          </div>
        </>
      )}
    </div>
  );
}
