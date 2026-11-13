# Accessibility and phone/desktop QA (Sprint 3)

Checked on November 13, 2026, against the code on `main` (PRs #30–#36) and the live site.

## Lighthouse Accessibility

Lighthouse 12, Accessibility category, phone ("mobile" form factor) and desktop.

| Page | Route | Phone | Desktop |
|---|---|---|---|
| Sign in | `#/signin` | 100 | 100 |
| Onboarding (profile setup) | `#/` (new account) | 100 | 100 |
| Find | `#/find` | 100 | 100 |
| Messages | `#/messages` | 100 | 100 |
| Chat | `#/messages/:chatId` | 100 | 100 |
| Profile (+ Manage group sheet) | `#/profile` | 100 | 100 |
| Admin portal | `#/admin` | 100 | 100 |
| OKR Dashboard | `#/admin/okrs` | 100 | 100 |

Every page is at or above the Definition of Done's 90. The only note Lighthouse raised (Profile: an empty photo slot showed "No photo yet" but was labeled "photo 2, not uploaded yet") is fixed in this PR, so its label now starts with the words on screen.

**Live site** (https://aura-is401.onrender.com, signed in as an admin): axe-core 4.10 (the engine behind Lighthouse's accessibility audits), WCAG 2.1 A/AA rules, found **0 violations** on Find, Messages, Chat, Profile, Admin portal and OKR Dashboard. The live API also confirmed migrations 006–008 are applied (Make main, group photos, admin).

## Phone (375 × 812) and desktop (1280 × 800)

On every page above, plus the Manage group sheet, at both sizes (73/73 checks):

- No sideways scrolling.
- No text overflowing its box (long names wrap or end in "…").
- Every button and link is at least 44px to tap (inline text links aside).
- Find: the whole group card ends above Pass / Connect, so the bar never covers it.
- axe-core: no WCAG A/AA problems, including with the Manage group sheet open.
