const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export const formatTime = (iso) => time.format(new Date(iso));

export function formatCost(cents) {
  if (!cents) return 'Free';
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

// Date tile on events: { dow: "FRI", day: 3, isToday }
export function dateTile(iso) {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  return { dow: isToday ? 'TODAY' : weekday.format(d).toUpperCase(), day: d.getDate(), isToday };
}

// Chat list: "9:42 PM" today, "Tue" this week, "Sep 26" otherwise.
export function formatChatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time.format(d);
  const days = (now - d) / 86400000;
  return days < 6 ? weekday.format(d) : monthDay.format(d);
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const RELATIONSHIP_LABELS = {
  single: 'Single',
  in_a_relationship: 'In a relationship',
  married: 'Married',
  its_complicated: "It's complicated",
  prefer_not_to_say: 'Prefer not to say',
};

export const GENDERS = ['Woman', 'Man', 'Nonbinary', 'Prefer not to say'];

export const TRAIT_SUGGESTIONS = [
  'Outgoing', 'Introvert', 'Planner', 'Spontaneous', 'Chill', 'Funny', 'Adventurous',
  'Creative', 'Competitive', 'Organizer', 'Curious', 'Warm', 'Easygoing', 'Host',
];
