// Signed-out pages remember where you were going: #/signin?next=/messages/7.
// Only real app pages are accepted as `next`. The admin portal (#/admin) has its own sign-in, so it isn't one.
export const APP_PATH = /^\/(find|messages(\/\d+)?|profile|join)(\?.*)?$/;

export const authHref = (page, next) => `#/${page}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
