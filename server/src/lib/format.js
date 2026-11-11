export const PASTELS = ['#FDDCCB', '#DCEBFD', '#DDF3E0', '#F6DCF0', '#FFF1B8', '#E6E1FF'];
export const randomPastel = () => PASTELS[Math.floor(Math.random() * PASTELS.length)];

// A person's main photo (position 1), or null if it's a placeholder: the client then draws their
// illustrated avatar. Use it in a query where the users table is aliased as u.
export const MAIN_PHOTO_SQL = '(SELECT p.image_url FROM user_photos p WHERE p.user_id = u.id AND p.position = 1)';

export const userInitials = (first, last) => `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();

// "Tuesday Crew" -> "TC", "Hikers" -> "HI"
export function groupInitials(name) {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2)).toUpperCase();
}

export const groupBadge = (g) => ({ id: g.id, name: g.name, initials: groupInitials(g.name), avatarColor: g.avatar_color });
