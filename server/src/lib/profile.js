import { forbidden } from '../errors.js';

// Rule 1: bio, 1-3 photos, at least 1 interest, age, gender, relationship status, personality.
export async function getOnboarding(db, userId) {
  const { rows: [r] } = await db.query(
    `SELECT u.bio, u.age, u.gender, u.relationship_status, cardinality(u.personality_traits) AS traits,
            (SELECT count(*) FROM user_photos p WHERE p.user_id = u.id)       AS photos,
            (SELECT count(*) FROM user_interests i WHERE i.user_id = u.id)    AS interests,
            (SELECT count(*) FROM group_memberships m WHERE m.user_id = u.id) AS groups
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  const missing = [];
  if (!r.bio) missing.push('bio');
  if (r.photos < 1) missing.push('photos');
  if (r.interests < 1) missing.push('interests');
  if (!r.age) missing.push('age');
  if (!r.gender) missing.push('gender');
  if (!r.relationship_status) missing.push('relationshipStatus');
  if (r.traits < 1) missing.push('personalityTraits');
  return { profileComplete: missing.length === 0, missing, hasGroup: r.groups > 0 };
}

export async function requireCompleteProfile(db, userId) {
  const onboarding = await getOnboarding(db, userId);
  if (!onboarding.profileComplete) {
    throw forbidden('PROFILE_INCOMPLETE', 'Finish your profile before creating or joining a group.', {
      missing: onboarding.missing,
    });
  }
}
