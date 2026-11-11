import Avatar from './Avatar.jsx';
import { RELATIONSHIP_LABELS } from '../format.js';

export default function MemberProfile({ profile }) {
  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase();
  const firstPhoto = profile.photos?.find((p) => p.imageUrl)?.imageUrl;
  const details = [
    profile.age && `${profile.age} years old`,
    profile.gender,
    RELATIONSHIP_LABELS[profile.relationshipStatus],
  ].filter(Boolean);
  return (
    <div className="member-profile">
      <div className="member-profile__head">
        <Avatar initials={initials} color={profile.avatarColor} size={72} src={firstPhoto} />
        <div className="member-profile__who">
          <h3>{profile.firstName} {profile.lastName}</h3>
          <p className="subtle">{profile.city}</p>
        </div>
      </div>
      {profile.photos?.length > 0 && (
        <div className="photos member-profile__photos" role="group" aria-label={`${profile.firstName}'s photos`}>
          {profile.photos.map((photo, i) => (
            photo.imageUrl ? (
              <div key={photo.id} className="photo">
                <img className="photo__img" src={photo.imageUrl} alt={`${profile.firstName}'s photo ${i + 1}`} loading="lazy" />
              </div>
            ) : (
              // Seed data has labels, not files: announce it as a photo slot, not as "[Photo 1]".
              <div key={photo.id} className="photo" role="img" aria-label={`${profile.firstName}'s photo ${i + 1} (not uploaded yet)`}
                style={{ background: '#E6E1FF', color: '#4C1D95' }}>
                <span aria-hidden="true">[{photo.label}]</span>
              </div>
            )
          ))}
        </div>
      )}
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
