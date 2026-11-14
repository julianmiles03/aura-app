# aura

**Live app: [https://aura-is401.onrender.com](https://aura-is401.onrender.com)**

A mobile-first web app that helps groups of friends find and meet other friend groups. Built by Team Aura: Clint Burton, David Medina, Jaemin Weight and Julian Miles.

The live app works on phones and desktops. Sign up with an email and password, or sign in with one of the [demo accounts](#sign-in-and-demo-accounts). The API runs on Render's free plan, so after about 15 idle minutes the first request takes up to a minute while it wakes up.

## App Summary

Friend groups often want to meet other friend groups and do things together: a game night, a hike, a pickup game. But they don't know where to find those groups or which ones are open to meeting new people. This is common for college students and young adults who have moved to a new city, or whose circle has gotten small, and existing apps match individuals for dating or networking rather than whole groups. aura lets each person build a profile and join or create a Friend Group of up to 10 people, then go through recommended groups one at a time, choosing Connect or Pass on behalf of their active group. Recommendations are ranked by shared interests, then mutual friends, then whether the group is in the same city. When one member of each group says "Connect", from Find or by accepting in the "Groups that liked you" inbox, the two groups match and aura automatically opens a shared group chat with everyone from both groups. An AI step then suggests three conversation starters, so somebody says the first word.

## Behavioral Requirements

From our Product Requirements Document.

| # | Requirement | Status | How it works in aura |
|---|---|---|---|
| 1 | When the user joins, the system prompts them to create a profile (personal info, photos, interests) and join or create a Friend Group. | **Complete** | New users go through profile setup, then must create or join a group (`403 PROFILE_INCOMPLETE` until the profile is done). Profile setup includes uploading a main photo plus up to 3 more from the camera roll or computer (see [Profile Photos](#profile-photos)). |
| 2 | When a user updates their interests, the shared Friend Group interests update automatically. | **Complete** | Group interests come from the `group_shared_interests` view (the union of members' interests), so they're never stored and change the moment a member edits theirs. |
| 3 | A Friend Group can't have more than 10 members; adding an 11th fails with an error returned to the user. | **Complete** | The `group_member_cap` trigger rejects the insert and the API returns `409 GROUP_FULL`, shown as an error in the app (try joining Wednesday Volleyball, which is full). |
| 4 | Users who aren't in a Friend Group get an error inviting them to create or join one before they can use the app. | **Complete** | Every group-scoped endpoint returns `403 NO_GROUP`, and the app shows the "Create or join a group" screen. |
| 5 | The matching screen shows one Friend Group at a time; after Connect or Pass, a new group is shown. | **Complete** | Find shows one card with labeled Pass and Connect buttons (swipe left/right on touch screens), then loads the next recommendation. |
| 6 | The system recommends Friend Groups based on mutual friends and interests. | **Complete** | `GET /api/recommendations` scores shared interests and mutual friends. |
| 7 | When a user swipes on another group, the system notifies that group's users. | **Complete** | A Connect shows up in the other group's "Groups that liked you" box in Messages (in-app; no push notifications). |
| 8 | Two groups match when one user from each says yes, from Find or from the inbox. | **Complete** | A reciprocal `connect` in `group_likes` creates the match, whether it comes from Find or from Accept. |
| 9 | Recommendations are ranked by (1) shared interests, (2) 1st- and 2nd-degree mutual connections, (3) geographic proximity. | **Complete** | Ordered by shared interests, then 1st-degree, then 2nd-degree mutual friends, then same city, then distance. Groups you already liked, passed or matched are excluded. |
| 10 | When two groups match, a group chat is created for both groups. | **Complete** | The match, its chat and every member of both groups as participants are created in one transaction (capped at 30 people by `chat_participant_cap`). |

**10 of 10 complete.**

## Vertical Slices

Each slice works end to end: a screen in the app, an API endpoint, and rows in Postgres, live at the URL above. **Target for Sprint 2: 10. Working now: 23.**

| # | Slice | What the user does | API | Database |
|---|---|---|---|---|
| 1 | Sign up and sign in | **Sign up** (name, city, email, password) goes straight to profile setup; returning users use **Sign in** ("Already have an account?") | Supabase Auth, then `POST /api/users`; every request sends the session as `Authorization: Bearer` | `auth.users`, `users.auth_user_id` |
| 2 | Profile and interests | Profile → edit bio, details and interests | `PATCH /api/me` | `users`, `user_interests` (group interests update through the `group_shared_interests` view) |
| 3 | Profile photos | Profile (or profile setup) → **Add photo** → pick an image; it uploads with a preview. Tap a photo → **Make main photo** or **Remove photo** (any but the last) | `POST /api/me/photos/upload`, `POST /api/me/photos/:id/main`, `DELETE /api/me/photos/:id` | `user_photos.image_url` + Supabase Storage bucket `profile-photos` |
| 4 | Onboarding gate | A user with no group sees "Create or join a group" instead of the app | any group endpoint → `403 NO_GROUP` | `group_memberships` |
| 5 | Create a group | Gate or Profile → **Create a group** | `POST /api/groups` | `friend_groups`, `group_memberships`, `users.active_group_id` |
| 6 | Join with an invite code | Enter a code (or paste the invite link); a wrong code says so under the field, a full group shows "already has 10 members" | `POST /api/groups/join` → `400 INVALID_INVITE_CODE`, `404 INVITE_NOT_FOUND`, `409 GROUP_FULL` | `group_memberships` (`group_member_cap` trigger) |
| 7 | Invite a friend to your group | Profile → **Invite friends**, or Manage group → **Add members** → pick a friend | `GET /api/me/friends`, `POST /api/groups/:id/members` | `friendships`, `group_memberships`, `chat_participants` |
| 8 | Manage group | Profile → tap a group: edit name and city, group photo, remove and add members, **Leave group** | `PATCH /api/groups/:id`, `DELETE /api/groups/:id/members/:userId`, `DELETE /api/groups/:id/members/me` | `friend_groups`, `group_memberships`, `chat_participants` |
| 9 | Switch active group | Group switcher on Find, "Chatting as" on Messages, or Profile → a group's **…** → **Make active group** | `PATCH /api/me/active-group` | `users.active_group_id` (composite FK to memberships) |
| 10 | Find, Connect and Pass | Find shows one ranked group at a time; **Connect** or **Pass** loads the next | `GET /api/recommendations`, `POST /api/groups/:id/likes` | `group_likes`; a mutual Connect creates the match and chat |
| 11 | Accept or decline a request | Messages → "Groups that liked you" → **Accept** (new chat appears) or decline | `GET /api/groups/:id/incoming-likes`, `POST /api/likes/:id/accept`, `POST /api/likes/:id/decline` | `group_likes`, `group_matches`, `chats`, `chat_participants` in one transaction |
| 12 | Group chat with live updates | Open a chat, send a message; the other group sees it within ~5 seconds | `GET /api/chats/:id/messages?after=`, `POST /api/chats/:id/messages` | `messages`, `chat_participants.last_read_at` |
| 13 | Archive, delete and restore chats | Messages → **Edit** → pick chats (or **Select all**) → archive / delete; **Archived** / **Recently deleted** links under the list to unarchive / restore | `GET /api/groups/:id/chats?view=`, `POST /api/chats/bulk` | `chat_participants` (per-person archived/deleted state) |
| 14 | Read receipts | Open a chat: small avatars show who has read how far, and your latest message says **Delivered** until someone reads it | `GET /api/chats/:id/messages` (`reads`) | `chat_participants.last_read_at`, `messages` |
| 15 | Typing indicator | Type in a chat: the other members see "Avery is typing…" within a few seconds, gone about 5 seconds after you stop | `POST`/`DELETE /api/chats/:id/typing`, `GET /api/chats/:id/messages` (`typing`) | `chat_participants.typing_at` |
| 16 | AI conversation starters | Open a new match's chat: three "Need an opener?" chips. Tap one to fill the message box, then send it | On a match the server asks the Gemini API for 3 starters; `GET /api/chats/:id/messages` (`suggestions`), `POST /api/chats/:id/messages` (`suggestionId`) | `chat_suggestions` (`text`, `used_at`) |
| 17 | We met up! | In a match chat, **We met up!** under the header → **Yes, we met up**; both groups then see "You met up on Oct 30" | `POST /api/chats/:id/meetup`, `GET /api/chats/:id/messages` (`meetup`) | `meetups` (feeds KR4) |
| 18 | OKR Dashboard | An admin signs in at **`#/admin`** → **OKR Dashboard**: KR1-KR4 against their targets, with the raw counts. **Refresh** reads them again | `GET /api/admin/okrs` (admin session only) | `okr_metrics` view |
| 19 | Admin portal sign-in and Maintain | Open **`#/admin`**: a landing page with the **Admin sign in** form. Signing in shows **Maintain Users**, **Maintain Records** and a **Maintain** button for every table (view its rows); **Log out** hides them again | `POST /api/admin/login`, `GET /api/admin/session`, `GET /api/admin/tables`, `GET /api/admin/tables/:name`, `POST /api/admin/logout`; admin data routes answer `401` without the session cookie | `admin_users` (bcrypt hash), `admin_sessions` (hashed token), every app table (read only) |
| 20 | Maintain Groups | Signed in to the admin portal: **Maintain Groups** → search the groups, **New group** (name, city, owner), open one to edit its name and city, **Add member** (up to 10; at 10 it's turned off), **Make owner**, **Remove**, **Delete group** | `GET`/`POST /api/admin/groups`, `GET`/`PATCH`/`DELETE /api/admin/groups/:id`, `POST /api/admin/groups/:id/members`, `PATCH`/`DELETE /api/admin/groups/:id/members/:userId`, `GET /api/admin/users`; an 11th member gets `409 GROUP_FULL` | `friend_groups`, `group_memberships` (`group_member_cap` trigger), `chat_participants`, `users.active_group_id` |
| 21 | Maintain Users | Signed in to the admin portal: **Maintain Users** → a table of every user, search, **Add user**, **Edit**, **Delete** (it says first what happens to their groups); each mistake is named under its field | `GET`/`POST /api/admin/users`, `GET`/`PATCH`/`DELETE /api/admin/users/:id`; bad input gets `400 VALIDATION_ERROR` with `details.fields` | `users` (and, on delete, `group_memberships`, `chat_participants`, `user_photos`, `group_likes`) |
| 22 | Maintain Interests | Signed in to the admin portal: **Maintain Interests** → a table of every interest with how many people and groups have it, search, **Add interest**, **Rename**, **Delete** (it says first whose profiles it comes off) | `GET`/`POST /api/admin/interests`, `PATCH`/`DELETE /api/admin/interests/:id`; a name that exists in any capitalization gets `409 INTEREST_EXISTS` | `interests` (and `user_interests`, the `group_shared_interests` view) |
| 23 | Maintain Meetups | Signed in to the admin portal: **Maintain Meetups** → a table of every "We met up!", **Add meetup** (match, day, who confirmed), **Edit**, **Delete** | `GET`/`POST /api/admin/meetups`, `GET /api/admin/meetups/matches`, `GET`/`PATCH`/`DELETE /api/admin/meetups/:id`; a second meetup for a match gets `409 MEETUP_EXISTS` | `meetups` (feeds KR4 in `okr_metrics`) |

Slice 11 has a step-by-step walkthrough in [Verifying the Vertical Slice](#verifying-the-vertical-slice), slice 12 in [Live Chat Updates](#live-chat-updates), slice 14 in [Read Receipts](#read-receipts), slice 15 in [Typing Indicator](#typing-indicator), slice 16 in [AI Conversation Starters](#ai-conversation-starters), slice 17 in [OKR Metrics](#okr-metrics), slice 18 in [OKR Dashboard](#okr-dashboard), slice 19 in [Admin Portal Sign-In](#admin-portal-sign-in), slice 20 in [Maintain Groups](#maintain-groups), slice 21 in [Maintain Users](#maintain-users), and slices 22 and 23 in [Maintain Interests and Meetups](#maintain-interests-and-meetups).

### Sprint 2 JW verification

The Sprint 2 JW-assigned changes are tracked in [`docs/vertical-slice-verification.md`](docs/vertical-slice-verification.md). The tracker covers real sign-up/profile setup, group creation and invite-link joining, Find location and member profiles, removal of the group Status field, matching, and chat. Each row must be re-verified on the deployed URL with a real login before the Trello card is moved to Done.

## System Architecture

![aura system architecture](docs/architecture.png)

- **Customer app:** users use the React website, which sends requests to our Express server. The server saves and loads data in Supabase, which also handles logins. Both run live on Render.
- **AI service:** when two groups match, the server sends both groups' names, cities and interests to Google's Gemini API, which returns three conversation starters for the new chat. See [AI Conversation Starters](#ai-conversation-starters).
- **Admin portal:** part of the same React website (`#/admin`), with its own landing page and sign-in: an admin email and password (only a bcrypt hash is stored, in `admin_users`) and an httpOnly session cookie (see [Admin Portal Sign-In](#admin-portal-sign-in)). It calls `/api/admin` on the website's own address, which Render forwards to our Express server, and every admin data route answers `401` without a valid session. Maintain Users adds, edits and deletes users (see [Maintain Users](#maintain-users)), Maintain Groups does the same for friend groups and their members (see [Maintain Groups](#maintain-groups)), Maintain Interests and Maintain Meetups for those two tables (see [Maintain Interests and Meetups](#maintain-interests-and-meetups)), Maintain Records shows each table's rows (view only), and the OKR Dashboard counts the KRs live in Supabase (see [OKR Dashboard](#okr-dashboard)). The diagram still shows the earlier plan for a separate admin portal hosted on AWS.

## Data Flow Diagrams

### Level 0: Context

![Level 0 data flow diagram of aura, described below](docs/dfd-level-0.jpg)

The whole app as one process. People send in their profiles and group choices and get recommendations and chats back. When two groups match, Google's Gemini API gets their group names, cities and interests (never member names or messages) and sends back conversation starters.

### Level 1: Core Workflows

![Level 1 data flow diagram of aura's five core processes and its database, described below](docs/dfd-level-1.jpg)

- **1.0 Set Up Profiles and Groups:** sign up, set up a profile, create or join a group.
- **2.0 Rank Group Recommendations:** Find ranks other groups for your active group by shared interests, then mutual friends, then location.
- **3.0 Record Connect or Pass:** every Connect or Pass is saved in `group_likes`.
- **4.0 Create Match and Chat:** when both groups say Connect, aura saves the match and opens a group chat for both groups. Then it asks Gemini for three conversation starters, which are checked before they're saved.
- **5.0 Exchange Chat Messages:** the group chat, with live updates.
- **D1 Aura Application Data:** our Postgres database on Supabase (see the [ERD](#erd)).

## ERD

![aura entity relationship diagram](docs/erd.png)

- Full model with every relationship's cardinality: [`docs/erd.dbml`](docs/erd.dbml) (paste into [dbdiagram.io](https://dbdiagram.io))
- Mermaid version: [`docs/erd.mmd`](docs/erd.mmd)
- The SQL that implements it: [`db/schema.sql`](db/schema.sql), with sample data in [`db/seed.sql`](db/seed.sql)

Business rules are enforced in the database, not just the UI:
- A trigger caps a group at 10 members (`GROUP_FULL`) and a chat at 30 people (`CHAT_FULL`).
- Unique constraints prevent duplicate likes, memberships and matches.
- A composite foreign key ensures your active group is one you belong to.
- A group's shared interests come from the `group_shared_interests` view, so they're never stored and update the moment a member edits their interests.

## OKR Metrics

All four Key Results are computed automatically by the `okr_metrics` view (in [`db/schema.sql`](db/schema.sql)). It's one row, recalculated from the live tables every time you read it, so nothing has to be counted by hand or kept in sync. Every number comes from real user activity in the app. The [OKR Dashboard](#okr-dashboard) in the admin portal reads it through `GET /api/admin/okrs` (below). You can also run `SELECT * FROM okr_metrics;` in Supabase's **SQL Editor**.

| KR | Measures | Column (count → percentage) | Formula | What updates it |
|---|---|---|---|---|
| **KR1** | % of registered groups that connect with another group | `connected_groups` → `kr1_connect_pct` | groups in at least one `group_matches` row ÷ all `friend_groups` | A **match**: two groups both say Connect (Find or Accept in "Groups that liked you") → new `group_matches` row. A **new group** → new `friend_groups` row (raises the denominator). |
| **KR2** | % of groups with 4+ people | `four_plus_groups` → `kr2_four_plus_pct` | groups with ≥ 4 `group_memberships` rows ÷ all `friend_groups` | Someone **creates, joins or leaves** a group, or is **invited** into one → `group_memberships` row added or removed. |
| **KR3** | % of connected groups that exchange messages | `messaging_groups` → `kr3_message_pct` | connected groups with a match chat where **both** groups have sent at least one message ÷ connected groups | A **message is sent** → new `messages` row. The sender's side comes from `chat_participants.group_id`. A chat where only one group has talked doesn't count yet. |
| **KR4** | % of connected groups that meet up | `meetup_groups` → `kr4_meetup_pct` | connected groups with at least one `meetups` row for any of their matches ÷ connected groups | Someone taps **We met up!** in a match chat and confirms → new `meetups` row (`match_id`, `confirmed_by_user_id`, `created_at`). |

### Which table or event drives each KR

| KR | Table | Event in the app | Try it on the live site (then refresh the admin dashboard) |
|---|---|---|---|
| **KR1** | `group_matches` (count), `friend_groups` (out of) | Two groups both tap **Connect**: on Find, or **Accept** in Messages → "Groups that liked you" | Sign in as a member of a group that has no match yet, open Messages → "Groups that liked you" and **Accept** (or Connect on Find with a group that already liked yours). **Connected groups** goes up by 2, or by 1 if the other group was already connected. |
| **KR2** | `group_memberships` | A 4th member joins a group: invite code, invite link or **Invite friends** | Create a group (1 member), then have 3 friends join it with its invite code. On the 4th, **groups with 4+ people** goes up by 1. A new group also adds 1 to the total, so KR1 and KR2's percentages dip until it grows. |
| **KR3** | `messages` (sender's group from `chat_participants.group_id`) | Both groups in a match send at least one message | Open a match chat where only one side has talked (or a brand-new match) and send a message from each group. When the second group sends, **messaging groups** goes up by 2. |
| **KR4** | `meetups` | Someone taps **We met up!** in a match chat and confirms | In a match chat that doesn't say "You met up on…", tap **We met up!** → **Yes, we met up**. **Meetup groups** goes up by 2, and both groups see the date in the chat. |

### "We met up!" (feeds KR4)

- **Where:** a bar under the header of every match chat, on phones and desktop. Until someone confirms, it asks "Met *other group* in person?" with a **We met up!** button. Tapping it opens a confirm sheet (**Not yet** / **Yes, we met up**), so a stray tap can't count.
- **What it saves:** `POST /api/chats/:id/meetup` adds one `meetups` row for the chat's match, with you as `confirmed_by_user_id`. Anyone in the chat, from either group, can confirm. The API checks you're in the chat (`403 NOT_IN_CHAT`, `404 CHAT_NOT_FOUND`).
- **One per match:** a match keeps its first meetup. Tapping again, or both groups tapping at the same moment, doesn't add a second row: the API answers `201` when it recorded the meetup and `200` when one already existed. The match row is locked while it checks, so two simultaneous taps can't both insert.
- **Afterward:** both groups see "You met up on Oct 30 · confirmed by Avery" in place of the button. The other group's open chat picks it up on its next poll (within about 5 seconds), because `GET /api/chats/:id/messages` (and `?after=`) returns `meetup: { metAt, confirmedBy } | null`.

### OKR Dashboard

This is where we track KR1-KR4, and what we show in the KR video and the live demo. It's in the admin portal, inside the app.

- **Opening it:** go to [`/#/admin`](https://aura-is401.onrender.com/#/admin), sign in with an admin account ([how to make one](#admin-portal-sign-in)) and choose **OKR Dashboard**, or open [`/#/admin/okrs`](https://aura-is401.onrender.com/#/admin/okrs) and sign in there. App users with `users.is_admin` also have an **Admin portal** shortcut on Profile (and in the desktop sidebar), which leads to the same sign-in. Without an admin session the API gives the dashboard no data (`401 ADMIN_SIGNED_OUT`).
- **What each KR card shows:** the current percentage next to the target, **On track** or **Below target**, the raw counts (for example "6 of 10 groups"), how far it is from the target ("2 more groups to reach the target" or "10 points above target"), and the action and table that move it. KR3 and KR4 show "No data yet" until some group has matched.
- **When it updates:** the numbers load when the page opens, and **Refresh** reads them again. The line under the title shows when they were read. There are no manual numbers: every value is counted from real activity by `okr_metrics`. The only fixed numbers are the targets.
- **Targets:** set in `TARGETS` in [`server/src/routes/admin.js`](server/src/routes/admin.js). Change them there.

  | KR | Target |
  |---|---|
  | KR1: groups that connect with another group | 50% |
  | KR2: groups with 4+ people | 40% |
  | KR3: connected groups that exchange messages | 60% |
  | KR4: connected groups that meet up | 25% |

- **Demoing it:** open the dashboard in one window and the app, signed in as a different demo account, in another. Do one of the actions in [Which table or event drives each KR](#which-table-or-event-drives-each-kr), then click **Refresh** on the dashboard to show the number change.
- **Phone and desktop:** phones get one column. From 1024px wide, the three tools sit side by side and the KR cards are two by two. Lighthouse Accessibility scores 100 on phone and desktop for the dashboard and the rest of the portal (see [Admin Portal Sign-In](#admin-portal-sign-in)).

### Admin dashboard API

The [OKR Dashboard](#okr-dashboard) shows the KRs from `GET /api/admin/okrs`. Like every admin data route, it needs an admin session: the `aura_admin` cookie from [Admin Portal Sign-In](#admin-portal-sign-in). Without one it answers `401 ADMIN_SIGNED_OUT`. The numbers are read live from `okr_metrics` on every request (no caching), so refreshing the dashboard after a user action shows the new value. The portal calls it at `/api/admin/okrs` on the website's own address, which Render forwards to the API.

```json
{
  "asOf": "2026-11-11T23:41:59.197Z",
  "totalGroups": 25,
  "connectedGroups": 15,
  "keyResults": [
    { "id": "KR1", "label": "Groups that connect with another group", "target": 50, "count": 15, "outOf": 25, "pct": 60, "drivenBy": "group_matches: two groups both tap Connect" },
    { "id": "KR2", "label": "Groups with 4+ people", "target": 40, "count": 6, "outOf": 25, "pct": 24, "drivenBy": "group_memberships: a 4th member joins a group" },
    { "id": "KR3", "label": "Connected groups that exchange messages", "target": 60, "count": 9, "outOf": 15, "pct": 60, "drivenBy": "messages: both groups in a match send at least one message" },
    { "id": "KR4", "label": "Connected groups that meet up", "target": 25, "count": 0, "outOf": 15, "pct": 0, "drivenBy": "meetups: someone taps \"We met up!\" in a match chat" }
  ]
}
```

`pct` is 0-100 with one decimal place, or `null` when `outOf` is 0. `target` is our goal for that KR, as a percentage. To give someone admin access, make them an admin account with `npm run db:admin-account` ([Admin Portal Sign-In](#admin-portal-sign-in)). `users.is_admin` only gives an app user the **Admin portal** shortcut in the app (`GET /api/me` returns it as `user.isAdmin`); set it in Supabase's **SQL Editor** (`users.id` is in the Table Editor):

```sql
UPDATE users SET is_admin = true WHERE id = <their users.id>;
```

Notes:
- A percentage is empty (`NULL`) instead of an error when its denominator is 0, for example KR3 and KR4 before any group has matched.
- **Updating an existing database:** schema changes that must keep everyone's other data go in `db/migrations/` as files that are safe to re-run. `npm run db:migrate` runs them all and prints the current KRs. `db/schema.sql` matches the result, so a fresh `npm run db:reset` ends up the same. `001_okr_metrics.sql` adds the OKR table and view; `002_drop_events.sql` removes the events feature (its two tables and their rows); `008_admin.sql` adds `users.is_admin`; `009_admin_login.sql` adds `admin_users` and `admin_sessions` for the admin portal's sign-in. All are applied to Find Friends App.

## Tech Stack

| Layer | Choice | Why it fits our team |
|---|---|---|
| Frontend | **React + Vite**, plain CSS (`/client`) | The most widely used UI library, so everyone on the team can contribute. Vite starts in under a second and reloads on save. Plain CSS with design tokens (no UI framework) keeps the mockups' look exact without another thing to learn. |
| Backend | **Node + Express** REST API (`/server`) | The same language as the frontend, so nobody has to switch languages. Express is small enough to read end to end, and each screen maps to a few clear endpoints that return JSON errors like `409 GROUP_FULL`. |
| Database | **PostgreSQL on Supabase**, accessed with `pg` | The free tier covers everything we need at this stage. Supabase's **Table Editor** lets the whole team see rows appear as we click through the app. All four of us point at **one shared database** (the Supabase project Find Friends App), so nobody's local setup drifts and seed data is the same for everyone. We use Supabase only as a Postgres host with plain SQL, so the work stays portable and shows real relational design (constraints, triggers, views). |
| Auth | **Supabase Auth** (email + password); the admin portal: **bcrypt** + an httpOnly session cookie | Supabase already hosts our database, so its Auth service adds real accounts without another vendor. The client uses only the small `@supabase/auth-js` package; the API checks each session token against Supabase's published signing keys (`jose`), so it needs no shared secret, and all app data still goes through our API. The admin portal's few staff accounts sign in separately: passwords hashed with `bcryptjs` (pure JavaScript, nothing to compile on Render) and a session row per browser, so log out really ends the session. |
| AI | **Google Gemini API** (`gemini-3.5-flash-lite`), called from the server with `fetch` | One small, fast model call per match is all we need, and Gemini has a free tier. It returns structured JSON that the server checks before saving, and plain `fetch` means no SDK to install or keep up to date. The key stays on the server. |
| Tooling | npm workspaces, `concurrently` | `npm install` installs everything once. `npm run dev` starts both servers, and `npm run db:reset` rebuilds the database from the SQL files. |

## How to Get It Running

These steps assume a fresh clone and no prior knowledge of the project. The whole team shares **one** database, the Supabase project **Find Friends App**, so you don't create your own.

1. **Install Node.js 20 or newer** (we develop on Node 24). Check with `node -v`. Get it from [nodejs.org](https://nodejs.org).

2. **Clone and install.**
   ```bash
   git clone https://github.com/julianmiles03/aura-app.git
   cd aura-app
   npm install
   ```

3. **Copy the connection string from Supabase.** Julian has to invite you to the Supabase organization first.
   1. In [Supabase](https://supabase.com/dashboard), open the project **Find Friends App**. Use only this project; any other project in the list (for example TESTAQUARIUM) is unrelated and has none of our tables.
   2. Click **Connect** (top bar) → **Direct** → **Session pooler** → **Type: URI** → copy. Don't retype it.
   3. Check the username, the part right after `postgresql://`. It must be **`postgres.rcyafwgjnnlgnakwkksi`**, not just `postgres`. The whole string looks like:
      `postgresql://postgres.rcyafwgjnnlgnakwkksi:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
      Use the Session pooler (port 5432), not the Direct connection (`db.rcyafwgjnnlgnakwkksi.supabase.co`). The direct one is IPv6-only on the free tier and won't connect from most home or campus networks.

4. **Get the database password from Julian by DM.** Replace `[YOUR-PASSWORD]` (including the brackets) with it. If the password contains `@ # / ? %`, percent-encode those characters (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `?` → `%3F`, `%` → `%25`).
   **Never reset the database password in Supabase.** Resetting it breaks everyone else's connection.

5. **Create your `.env` file** and paste the full string as `DATABASE_URL`:
   ```bash
   cp server/.env.example server/.env
   ```
   Open `server/.env` and replace the whole `DATABASE_URL=...` line with `DATABASE_URL=<the string from steps 3–4>`. Set `SUPABASE_URL=https://rcyafwgjnnlgnakwkksi.supabase.co`, and copy `SUPABASE_PUBLISHABLE_KEY` from `client/.env.development` (it's public). Get `DEMO_PASSWORD` from Julian by DM; only the demo and `verify:*` scripts use it. `server/.env` is git-ignored, so your passwords never get committed.

   Optional: to use the [admin portal](#admin-portal-sign-in), add `ADMIN_EMAIL` and `ADMIN_PASSWORD` (your own, 12+ characters) and run `npm run db:admin-account` once.

   Optional: to see the [AI conversation starters](#ai-conversation-starters) locally, also add `GEMINI_API_KEY=<the team's Gemini key>`. Without it everything else works; new chats just have no suggested openers.

6. **Check the connection.**
   ```bash
   npm run db:check
   ```
   You should see `OK: users table has N rows. Your server/.env is right.` If not, it prints the exact fix (see Troubleshooting below). This check is read-only and safe to run any time.

7. **Start the app.**
   ```bash
   npm run dev
   ```
   This starts the API on http://localhost:4000 and the web app on http://localhost:5173. **Open http://localhost:5173** and sign in with a [demo account](#sign-in-and-demo-accounts) or sign up. On a desktop it renders at phone width; for the true mobile view, use your browser's device toolbar.

The tables and sample data already exist in Find Friends App. `npm run db:reset` rebuilds them from `db/schema.sql` and `db/seed.sql`, but it **wipes everyone's data on the shared database**, so only run it after the team agrees.

**Troubleshooting**
- **`Tenant or user not found`** or **`no tenant identifier provided`**: the username is missing the project ref. It must be `postgres.rcyafwgjnnlgnakwkksi`, not `postgres`. Re-copy the Session pooler URI.
- **`password authentication failed`**: the password is wrong, or it has special characters that aren't percent-encoded. Ask Julian for the current password. Don't reset it.
- **`DATABASE_URL is not set`**: `server/.env` is missing, or still has a placeholder like `<your-db-password>` or `[YOUR-PASSWORD]`.
- **`ENOTFOUND` / `ENETUNREACH` / timeouts**: you copied the Direct connection (`db.….supabase.co`). Use the Session pooler URI instead.
- **`relation "users" does not exist`**: you're connected to the wrong Supabase project. Use Find Friends App.
- The page says it can't reach the server: make sure `npm run dev` is still running.

## Deployment

The live app runs on [Render](https://render.com), set up from [`render.yaml`](render.yaml) (a Render Blueprint) in Julian's Render account:

- **`aura-is401-api`** (web service): the Express API. `DATABASE_URL` is set in Render's Environment tab, never in the repo. So is `GEMINI_API_KEY`, the key for the [AI conversation starters](#ai-conversation-starters); without it the app runs normally, with no suggested openers. `CORS_ORIGIN` allows only the client's URL to call the API from a browser.
- **`aura-is401`** (static site): the Vite build of the client. `VITE_API_URL` tells it where the API lives, and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` point it at Supabase Auth; all are baked in at build time and are public. Its rewrite rule forwards `/api/*` on the client's address to the API, which the admin portal uses so its session cookie belongs to the client's site ([why](#admin-portal-sign-in)). If it's missing under **aura-is401 → Redirects/Rewrites**, add it: Source `/api/*`, Destination `https://aura-is401-api.onrender.com/api/*`, Action **Rewrite**.
- The API's `SUPABASE_URL` (also public) is where it fetches Supabase's signing keys to check sessions.

Every push or merge to `main` redeploys both automatically (about a minute); nothing to click. To set it up from scratch: Render Dashboard → **New → Blueprint** → pick this repo → paste the Session pooler URI as `DATABASE_URL` and the Gemini key as `GEMINI_API_KEY` → **Apply**. If Render gives either service a different URL (it adds a suffix when a name is taken), update `CORS_ORIGIN` and `VITE_API_URL` to match.

Render only asks for secret values like these when a Blueprint is first created. To add or change one on the running service, open **`aura-is401-api` → Environment**, add the variable and save; Render redeploys the API. `https://aura-is401-api.onrender.com/api/health` shows `"aiOpeners": true` once the API has a Gemini key.

## Sign In and Demo Accounts

Accounts are **Supabase Auth** users (email + password). New visitors see **Sign up**; "Already have an account? Sign in" goes to the separate sign-in page. The admin portal has its own sign-in, described in [Admin Portal Sign-In](#admin-portal-sign-in).

- **Sign up** creates the Supabase Auth account, then the app creates its `users` row (`POST /api/users`, linked by `users.auth_user_id`) and goes to profile setup.
- **Every API request** sends the session as `Authorization: Bearer <access token>`. The API verifies it against Supabase's published signing keys and loads the `users` row for that account. No token, a bad token or an expired one gets **`401`** (`NOT_SIGNED_IN` or `SESSION_EXPIRED`) and the app goes back to Sign in. A valid session with no `users` row gets `403 NO_PROFILE`, and the app asks for name and city. Only `GET /api/interests` and `GET /api/health` work without signing in.
- **Staying signed in:** the session is saved in the browser (local storage), so it survives a refresh and closing the tab, and Supabase renews it in the background. It ends when you press **Log out** (on Profile, and also in the sidebar on a desktop) or when the API rejects it.
- **Back to where you were:** opening any app page while signed out, such as a link to `#/messages/7`, goes to Sign in as `#/signin?next=/messages/7`. Signing in, or switching to Sign up from there, returns to that page. The same happens when a session expires. A bare URL with no page shows Sign up (new visitors), Log out goes to plain Sign in, and `next` only accepts aura's own pages (`/find`, `/messages`, `/messages/<id>`, `/profile`).
- **Supabase settings:** Authentication → Sign In / Providers → Email has **Confirm email off** (Supabase's built-in email is limited to a few messages an hour) and a minimum password length of 8.

**Demo accounts.** Every seeded user can sign in. All 16 share one password, which Julian sends to the team privately. It is **never** in this repo, because the repo is public. Groups below are from fresh seed data; the live database may have changed since.

| # | Email | Signs in as | Active group | Also in | Good for |
|---|---|---|---|---|---|
| 1 | `avery@example.com` | Avery Hansen | Tuesday Crew | Wednesday Volleyball | Main demo user: 2 incoming requests to Accept |
| 2 | `ben@example.com` | Ben Kim | Tuesday Crew | - | Only in Tuesday Crew, so they can Accept any request to it |
| 3 | `chloe@example.com` | Chloe Martin | Tuesday Crew | Wednesday Volleyball | - |
| 4 | `diego@example.com` | Diego Ramos | Tuesday Crew | Wednesday Volleyball | - |
| 5 | `emma@example.com` | Emma Wright | Tuesday Crew | - | - |
| 6 | `finn@example.com` | Finn Taylor | Tuesday Crew | Wednesday Volleyball | - |
| 7 | `maya@example.com` | Maya Patel | Sunday Summit Club | - | Chats with Tuesday Crew (live chat and read receipts) |
| 8 | `theo@example.com` | Theo Nguyen | Sunday Summit Club | Film Fridays | - |
| 9 | `priya@example.com` | Priya Shah | Sunday Summit Club | Court Crew | - |
| 10 | `sam@example.com` | Sam Jensen | Sunday Summit Club | Wednesday Volleyball | - |
| 11 | `jordan@example.com` | Jordan Reyes | Sunday Summit Club | Court Crew | - |
| 12 | `lena@example.com` | Lena Novak | Sunday Summit Club | Film Fridays, Wednesday Volleyball | - |
| 13 | `grace@example.com` | Grace Lee | Court Crew | Film Fridays, Wednesday Volleyball | Court Crew liked Tuesday Crew |
| 14 | `eli@example.com` | Eli Brooks | Court Crew | Film Fridays, Wednesday Volleyball | - |
| 15 | `noah@example.com` | Noah Carter | Court Crew | Wednesday Volleyball | - |
| 16 | `zoe@example.com` | Zoe Adams | Wednesday Volleyball | Film Fridays | Wednesday Volleyball is full (10 of 10) |

To see onboarding, sign up as someone new. The `verify:*` scripts sign in as these accounts with `DEMO_PASSWORD` from `server/.env`.

**Setting them up (already done for Find Friends App):**
1. Run `npm run db:migrate`. Migration `003_auth_users.sql` adds `users.auth_user_id`.
2. Run [`db/migrations/003_auth_users.sql`](db/migrations/003_auth_users.sql) once more in Supabase → SQL Editor. Supabase only lets the `postgres` login reference `auth.users`, so this is what adds the foreign key. The app's own login skips it with a warning.
3. Put `DEMO_PASSWORD` in `server/.env`, then run `npm run db:demo-accounts`. It creates the 16 logins and links them by id.

Run `npm run db:demo-accounts` again after any `db:reset`: a reset keeps the logins but unlinks them. It's safe to re-run.

## Admin Portal Sign-In

The admin portal ([`/#/admin`](https://aura-is401.onrender.com/#/admin)) has its own landing page and its own sign-in, separate from the app's Supabase accounts. Signed out, every admin page shows the landing page: what the portal is for, a screenshot of the OKR Dashboard, and the **Admin sign in** form. The admin tools appear only after signing in.

**Admin login for graders:** it's in our submission, not here. This repo is public, and an admin can read every table, chat messages included. Teammates: ask David for it, or make your own (see **Making an admin account** below).

| Page | Signed out | Signed in |
|---|---|---|
| `#/admin` | Landing page and the **Admin sign in** form (email, password) | **Maintain Users**, **Maintain Groups**, **Maintain Interests**, **Maintain Meetups**, **Maintain Records** and **OKR Dashboard**; under them, **Every table** with a **Maintain** button for each of the 14 tables; **Log out** in the header |
| `#/admin/users` | Landing page and form | [Maintain Users](#maintain-users): the table of users, with add, edit and delete |
| `#/admin/groups`, `#/admin/groups/<id>` | Landing page and form | [Maintain Groups](#maintain-groups): every group, or one group to edit |
| `#/admin/interests`, `#/admin/meetups` | Landing page and form | [Maintain Interests and Meetups](#maintain-interests-and-meetups): each table, with create, edit and delete |
| `#/admin/records` | Landing page and form; after signing in you're on this page | Every table except users, each with its own **Maintain** button |
| `#/admin/tables/<name>` | Landing page and form | That table's row count and newest 50 rows, view only |
| `#/admin/okrs` | Landing page and form | The [OKR Dashboard](#okr-dashboard) |

- The per-table **Maintain** pages are view only. On phones the table scrolls sideways inside its box. Users, groups, memberships, interests and meetups are edited in their own Maintain tools, and those tables' pages link there; other rows change through the app or Supabase's Table Editor.
- **Log out** ends the session and clears the cookie, and the portal goes back to the landing page with the tools hidden. Opening an admin link after that shows the sign-in form again.

**How sign-in works** ([`server/src/lib/adminAuth.js`](server/src/lib/adminAuth.js), [`server/src/routes/admin.js`](server/src/routes/admin.js))

1. The form sends `user_email` and `user_password` to `POST /api/admin/login`.
2. The API finds the email in `admin_users` (case doesn't matter) and checks the password with **bcrypt** (`bcryptjs`, cost 12) against `admin_users.user_password`, which holds only the hash. A wrong email and a wrong password get the same answer, `401 ADMIN_LOGIN_FAILED`, in about the same time, so the form can't be used to find admin emails. After 5 wrong passwords for one email in 15 minutes, that email gets `429 TOO_MANY_ATTEMPTS` until the 15 minutes are up.
3. If they match, the API makes a random 32-byte session token, saves only its SHA-256 hash in `admin_sessions` (expiring 8 hours later), and sends the token in the cookie **`aura_admin`**: `HttpOnly` (page JavaScript can't read it), `SameSite=Strict` (another site can't make the browser send it), `Secure` on the live site, and `Path=/api/admin` (only the admin API receives it).
4. Every other `/api/admin` route runs `requireAdminSession`. No cookie, an unknown token or an expired session gets **`401 ADMIN_SIGNED_OUT`** and no data, and the portal shows the sign-in form again.
5. `POST /api/admin/logout` deletes the `admin_sessions` row and clears the cookie, so even a saved copy of the old cookie stops working.

| Route | Needs a session | What it does |
|---|---|---|
| `POST /api/admin/login` | No | `{ user_email, user_password }` → `{ admin: { email, expiresAt } }` plus the cookie, or `401 ADMIN_LOGIN_FAILED` / `429 TOO_MANY_ATTEMPTS` |
| `GET /api/admin/session` | No | `{ admin: { email, expiresAt } }` or `{ admin: null }`; the portal asks on load |
| `POST /api/admin/logout` | No | Ends the session and clears the cookie (`204`) |
| `GET /api/admin/okrs` | **Yes** | The KRs ([Admin dashboard API](#admin-dashboard-api)) |
| `GET /api/admin/tables` | **Yes** | Every table with its row count |
| `GET /api/admin/tables/:name` | **Yes** | That table's columns and newest 50 rows; `404 TABLE_NOT_FOUND` for any name not on the list (`admin_users` and `admin_sessions` never are) |

**Making an admin account.** Admin accounts are separate from app accounts, and neither the seed nor a migration creates one. Put `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters) in `server/.env`, then run:

```bash
npm run db:admin-account                 # or, for another email: npm run db:admin-account -- someone@example.com
```

It saves the bcrypt hash, never the password. Running it again for the same email changes the password and signs that admin out everywhere. `db:reset` deletes admin accounts, so run it again after a reset. Migration [`009_admin_login.sql`](db/migrations/009_admin_login.sql) adds the two tables to an existing database (`npm run db:migrate`).

**Why the portal calls `/api` on its own address.** The client and the API are on two different `onrender.com` addresses, which browsers treat as two different sites, and Safari (so every iPhone) won't keep a cookie set by a different site. So the portal always calls `/api/admin/...` on the client's own address. Locally Vite forwards that to the API; on Render, the static site's rewrite rule in [`render.yaml`](render.yaml) (`/api/*` → `https://aura-is401-api.onrender.com/api/*`) does. The rest of the app still calls the API directly with its Supabase token. If the rule is ever missing, the portal says it can't reach the server; see [Deployment](#deployment).

**Checking it.** With `npm run dev` running and `ADMIN_EMAIL` / `ADMIN_PASSWORD` set for an admin account, `npm run verify:admin` runs 27 checks against the API and the database: every admin data route is `401` without a session or with a made-up cookie, a wrong password sets no cookie, the lockout, the cookie's `HttpOnly` / `SameSite=Strict` / `Path`, only hashes in the database, the signed-in routes, and that logging out deletes the session so the old cookie stops working. It signs in once and logs out, which adds and then removes one `admin_sessions` row, so it's fine on the shared database.

**Phone and desktop.** On phones everything is one column, with the sign-in form right under the intro. From 1024px wide the intro and the form sit side by side, the four tools are in one row and the tables are a grid. Lighthouse Accessibility is 100 on phone and desktop for the landing page, the signed-in home, Maintain Records, a table page and the OKR Dashboard.

## Maintain Users

In the admin portal, **Maintain Users** (`#/admin/users`) is a table of every aura user with **Add user**, **Edit** and **Delete**. Like every admin tool, its button only appears after signing in to the portal, and its API routes answer `401 ADMIN_SIGNED_OUT` without an admin session.

- **The table** lists everyone A to Z: name (with their photo or illustrated avatar), city, age, how many groups they're in, whether they have a login, and when they were added. **Search** filters by name or city. On phones it shows name (with the city under it), groups and the two buttons, so it fits without scrolling sideways. From 1024px wide every column shows and the buttons say **Edit** and **Delete**.
- **Add user** and **Edit** open the same form: first name, last name and city (required), plus age, gender, relationship status and bio (optional), with the same limits as the app's own profile form. Edit opens with their details filled in.
- **Delete** first says what will happen. Their profile, photos and the Connects and Passes they made for groups are deleted. For each of their groups it says who becomes the owner, or that the group is deleted too because nobody else is in it. Their messages stay in chats as from a "Former member". Focus starts on **Cancel**.

**What a user is here.** A row in `users`: the aura profile. Logins are Supabase Auth accounts, which Maintain Users doesn't touch. So someone added here has a profile but no login (like the seeded users before `db:demo-accounts`), and the table's **Login** column says who has one. Deleting someone removes their aura profile but not their Supabase login; if they sign in again, the app asks them to set up a new profile.

**Validation and friendly errors.** The page checks the same rules as the API before sending anything. When something's wrong, every problem is named under its own field ("First name can't be empty.", "Age must be a whole number between 18 and 120."), a summary at the top says how many fields need fixing, and focus moves to the first one. Each message is tied to its field (`aria-invalid`, `aria-describedby`), so screen readers read it with the field. Typing in a field clears its message. The API checks everything again and answers `400 VALIDATION_ERROR` with `details.fields`, one message per field, so the form can mark them all at once. Its limits: first and last name up to 50 characters, city up to 80, bio up to 500, age 18 to 120, and a relationship status from the app's list.

**Deleting** goes through the same helper the app uses when someone leaves a group (`removeMembership` in [`server/src/lib/groups.js`](server/src/lib/groups.js)): they leave each group's chats, ownership passes to the longest-standing member, and a group left with nobody in it is deleted, as in the app. Then the `users` row goes, and the database's `ON DELETE` rules do the rest. Their photo files are deleted from storage.

| Route (admin session required) | What it does |
|---|---|
| `GET /api/admin/users?limit=&q=&groupId=` | Everyone A to Z (`limit` up to 500; 20 by default), or those whose name contains `q`; each with `groupCount`, `hasLogin` and, with `groupId`, `inGroup` (Maintain Groups' people search uses this too) |
| `GET /api/admin/users/:id` | One user with their bio, their groups (and who would own each without them), and their message, Connect/Pass and photo counts; `404 USER_NOT_FOUND` |
| `POST /api/admin/users` | `{ firstName, lastName, city, age?, gender?, relationshipStatus?, bio? }` → `201 { user }`; `400 VALIDATION_ERROR` with `details.fields` |
| `PATCH /api/admin/users/:id` | Any of the same fields; the ones left out don't change |
| `DELETE /api/admin/users/:id` | `204`; everything above handled |

**Checking it.** With `npm run dev` running and `ADMIN_EMAIL` / `ADMIN_PASSWORD` set, `npm run verify:admin-users` runs 28 checks against the API and the database: `401` without a session, each validation problem named at once with nothing saved, add / list / search / edit (and edit's checks), `404`s, and deleting someone who owns two groups (ownership passes on in one, the other is deleted). It adds two test people and two test groups and briefly puts one existing user in a test group, then deletes all of it, so ask the team before running it on the shared database.

**Phone and desktop.** Lighthouse Accessibility is 100 on phone and desktop for the table, the Add form showing its errors, the Edit form and the Delete question.

## Maintain Interests and Meetups

Two more tools in the admin portal, each with its own button on the admin home (shown only after signing in): **Maintain Interests** (`#/admin/interests`) and **Maintain Meetups** (`#/admin/meetups`). Both are tables with create, edit and delete. Their API routes answer `401 ADMIN_SIGNED_OUT` without an admin session.

**Maintain Interests**
- **The table:** every interest A to Z, how many people picked it and how many groups show it (a group's interests are its members'). **Search** by name. On phones the group count moves under the name.
- **Add interest** and **Rename:** one field, 1 to 40 characters. Names are unique in any capitalization, like the database's index: "hiking" when "Hiking" exists gets "There's already an interest called “Hiking”." under the field (`409 INTEREST_EXISTS`). Renaming only the capitalization is fine. A rename shows up on every profile and group card at once.
- **Delete** says first how many people's profiles it comes off and how many groups stop showing it. If it was someone's only interest, the confirm says the app will ask them to add one (a profile needs at least one). The database removes it from everyone (`user_interests` cascades).

**Maintain Meetups**
- **The table:** every meetup, newest first: the two groups, the day they met, and who confirmed it (or "Not recorded"). On phones the day and the confirmer move under the groups.
- **Add meetup:** pick the match (only matches without a meetup are listed), the day, and optionally who confirmed it (someone in that match's chat). **Edit** changes the day and the confirmer. The match stays; to move a meetup, delete it and add one for the other match.
- **The rules are the app's** ("We met up!", `POST /api/chats/:id/meetup`). One meetup per match: the match row is locked while checking, so two admins adding one at the same moment can't both succeed (`409 MEETUP_EXISTS`). The day can't be in the future or before the two groups matched. The day is saved at noon UTC, so both groups' chats show the day that was picked. Every problem is named under its field (`400 VALIDATION_ERROR` with `details.fields`).
- **KR4:** meetups are what KR4 counts, so adding or deleting one moves the [OKR Dashboard](#okr-dashboard). Deleting also brings back the **We met up!** button in that chat, and the confirm says so.

| Route (admin session required) | What it does |
|---|---|
| `GET /api/admin/interests` | Every interest with `userCount`, `groupCount` and `onlyInterestCount` |
| `POST /api/admin/interests` | `{ name }` → `201 { interest }`; `400 VALIDATION_ERROR`, `409 INTEREST_EXISTS` |
| `PATCH /api/admin/interests/:id` | `{ name }`: rename; `404 INTEREST_NOT_FOUND`, `409 INTEREST_EXISTS` |
| `DELETE /api/admin/interests/:id` | `204`; it comes off every profile |
| `GET /api/admin/meetups` | Every meetup with its two groups, `metAt` and `confirmedBy` |
| `GET /api/admin/meetups/matches` | Every match, `hasMeetup`, and the `people` in its chat (for the form) |
| `POST /api/admin/meetups` | `{ matchId, metOn: "YYYY-MM-DD", confirmedByUserId? }` → `201 { meetup }`; `400 VALIDATION_ERROR`, `404 MATCH_NOT_FOUND`, `409 MEETUP_EXISTS` |
| `PATCH /api/admin/meetups/:id` | `{ metOn?, confirmedByUserId? }`; `404 MEETUP_NOT_FOUND` |
| `DELETE /api/admin/meetups/:id` | `204`; KR4 stops counting it |

**Checking it.** With `npm run dev` running and `ADMIN_EMAIL` / `ADMIN_PASSWORD` set:
- `npm run verify:admin-interests` runs 20 checks: `401` without a session, blank and too-long names, a duplicate in other capitals, create / list / rename (including capitals only) / `404`, and deleting an interest that's on a profile. It adds two test interests and a test person and deletes them, so the data ends up as it was.
- `npm run verify:admin-meetups` runs 24 checks: `401`s, every validation problem at once (no match, a future day, a day before the match, someone outside the chat, a date that doesn't exist), create, a second meetup for the same match refused, two creates at the same moment leaving exactly one, edit and its checks, and delete, with KR4 back where it started. It needs a match with no meetup. KR4 goes up for a few seconds, so ask the team before running it on the shared database.

**Phone and desktop.** Lighthouse Accessibility is 100 on phone and desktop for the admin home with its six tools, both tables, both Add forms showing their errors, the Edit meetup form and both Delete questions.

## Maintain Groups

In the admin portal, **Maintain Groups** (`#/admin/groups`) creates, shows, edits and deletes friend groups and their memberships. Its button, like every admin tool, only appears after signing in to the portal, and its API routes answer `401 ADMIN_SIGNED_OUT` without an admin session.

| Page | What an admin can do |
|---|---|
| `#/admin/groups` | See every group A to Z with its city, owner and "7 of 10" (a **Full** tag at 10). **Search** by name, city or owner. **New group**: name, city and the owner, found by searching people by name. The owner is the group's first member. |
| `#/admin/groups/<id>` | **Details**: change the name and city. **Members**: each person with their city, when they joined, **Owner** and "Acting as this group" tags; **Add member** (search, then **Add**; the sheet stays open to add several people), **Make owner**, **Remove**. **Delete group**: says exactly what goes with it (memberships, matches and their chats and messages, Connects and Passes) and asks first. |

**The rules it keeps** (all on the server, in [`server/src/routes/adminGroups.js`](server/src/routes/adminGroups.js) and [`server/src/lib/groups.js`](server/src/lib/groups.js)):
- **At most 10 members.** The database trigger `group_member_cap` refuses an 11th, so an admin gets `409 GROUP_FULL` even if two admins add someone at the same moment. The page shows "10 of 10", turns **Add member** off and says why.
- **One owner, never empty.** A new group starts with its owner. **Make owner** makes the old owner a regular member. Removing the owner hands it to the longest-standing member (the confirm sheet says who). The last member can't be removed (`409 LAST_MEMBER`): delete the group instead.
- **The same as in the app.** Adding and removing go through the same helpers the app uses (`createGroup`, `addMember`, `removeMembership`, `setOwner` in `lib/groups.js`). A new member joins the group's match chats, someone removed leaves them, and anyone whose active group goes away switches to their oldest other group. Creating a group or adding someone never changes the group a person is acting as, unless they had none.
- **Deleting** a group removes everything that belongs to it through the database's `ON DELETE CASCADE`: memberships, likes sent and received, matches, and those matches' chats with their messages. Its group photo is deleted from storage too.

| Route (admin session required) | What it does |
|---|---|
| `GET /api/admin/groups` | Every group with `memberCount`, `maxMembers`, `isFull`, `matchCount` and `owner` |
| `POST /api/admin/groups` | `{ name, city, ownerUserId }` → `201 { group }`; `400 VALIDATION_ERROR`, `404 USER_NOT_FOUND` |
| `GET /api/admin/groups/:id` | The group with its `members` (role, joined, `isActiveGroup`) and the counts shown before deleting; `404 GROUP_NOT_FOUND` |
| `PATCH /api/admin/groups/:id` | `{ name?, city? }`; neither can be blank |
| `DELETE /api/admin/groups/:id` | `204`, everything above deleted with it |
| `POST /api/admin/groups/:id/members` | `{ userId }` → `201 { group }`; `409 GROUP_FULL`, `409 ALREADY_MEMBER`, `404 USER_NOT_FOUND` |
| `PATCH /api/admin/groups/:id/members/:userId` | `{ role: "owner" }`: makes them the owner |
| `DELETE /api/admin/groups/:id/members/:userId` | Removes them; `409 LAST_MEMBER`, `404 MEMBER_NOT_FOUND` |
| `GET /api/admin/users?q=&groupId=` | Up to 20 people whose name contains `q`, each with `groupCount` and `inGroup` (for the people search) |

The **Maintain** pages for the `friend_groups` and `group_memberships` tables link here too.

**Checking it.** With `npm run dev` running and `ADMIN_EMAIL` / `ADMIN_PASSWORD` set, `npm run verify:admin-groups` runs 32 checks against the API and the database: `401` without a session (and nothing created), create's validation, adding up to 10 then `409 GROUP_FULL` for the 11th with still 10 rows in the database, `409 ALREADY_MEMBER`, edit and its validation, **Make owner** leaving exactly one owner, ownership passing on when the owner is removed, `409 LAST_MEMBER`, and delete removing the group and its memberships with everyone's active group as it was. It creates two test groups and adds 11 existing users who already have an active group to one of them for a few seconds, then deletes both. Others can see the test groups in Find meanwhile, so ask the team before running it on the shared database.

**Phone and desktop.** Phones get one column, and sheets slide up from the bottom. From 1024px wide the groups list is two across, a group's details and delete sit beside its members, and the sheets are centered dialogs. Lighthouse Accessibility is 100 on phone and desktop for the list, a group, a full group, and the New group, Add member and Remove sheets while open.

## How We Merge

`main` is what's live, so changes reach it only through a pull request.

1. **Branch.** Start from an up-to-date `main`: `git checkout main && git pull`, then `git checkout -b yourname/short-description`.
2. **Pull request.** Commit, `git push -u origin yourname/short-description`, and open a PR into `main` on GitHub. Say what changed and how you tested it.
3. **Review.** The **CI** check (GitHub Actions) runs `npm ci && npm run build` on every PR; it must be green. A teammate reads the PR and approves it or asks for changes.
4. **Merge.** Click **Merge pull request** and delete the branch. Render redeploys the live app from `main` within about a minute. Open https://aura-is401.onrender.com and check your change.

## Verifying the Vertical Slice

The vertical slice is **Accept** in "Groups that liked you". It goes from the browser through the API into Postgres and back, without a page reload.

1. **Sign in as Avery Hansen** (`avery@example.com`, active group Tuesday Crew; see [Demo Accounts](#sign-in-and-demo-accounts)). If you're signed in as someone else, press **Log out** on Profile first.
2. **Go to Messages and click Accept on a request.** The purple box says "2 groups want to meet Tuesday Crew" (Court Crew and Film Fridays). Click **Accept** on one of them. The client sends `POST /api/likes/:id/accept`. In one database transaction, the server records Tuesday Crew's "connect", creates the `group_matches` row, creates the `chats` row, and adds every member of both groups to `chat_participants`. It then returns the new chat.
3. **See the new chat appear.** The request disappears from the box, and the new chat, for example "Tuesday Crew + Court Crew · 11 people", appears highlighted at the top of the Chats list with no reload. Tap it to send the first message.
4. **Refresh the page and confirm it's still there.** Press reload. The request stays gone and the chat is still at the top of Chats.
5. **Confirm the new rows in Supabase's Table Editor.** In your Supabase project, open **Table Editor**:
   - `group_matches` has a new row pairing group 1 (Tuesday Crew) with the group you accepted.
   - `chats` has a new row named after both groups, whose `match_id` points to that match.
   - `chat_participants` has a row for each member of both groups (filter by the new `chat_id`).

   The new match and chat have the same timestamp, because they were created in the same transaction.

### Verifying Decline

The **Decline** action in "Groups that liked you" asks for confirmation before sending `POST /api/likes/:id/decline`. After confirmation, the request disappears without a page reload. Refresh Messages to confirm it stays gone, then open Find and confirm the declined group is not recommended again. In Supabase's **Table Editor**, the original `group_likes` row should have `decision = 'pass'`.

With `npm run dev` running, `npm run verify:decline` checks the API response, refreshed inbox, recommendation exclusion, persisted `group_likes` decision, and duplicate-decline handling. It really declines a request, so run `npm run db:reset` afterwards to restore the demo data.

Run `npm run db:reset` to put the two requests back for the next demo (check with the team first, because it resets the shared database).

You can also check the slice automatically. With `npm run dev` running, run `npm run verify:slice`. It accepts a request as Avery, checks the API response, refetches like a browser refresh would, checks the database rows, and prints `PASS`/`FAIL` for each step. It really accepts a request, so coordinate with the team before running it on the shared database.

## Live Chat Updates

When the other group sends a message, it shows up in your open chat within about 5 seconds, with no reload.

- **Only new messages.** An open chat calls `GET /api/chats/:id/messages?after=<last message id>` every ~5 seconds (`after=0` for a chat with no messages yet). The server returns only messages newer than the last one on screen, oldest first, and marks the chat read only when something new came back.
- **Background tabs pause.** Polling stops while the tab is hidden and catches up as soon as you come back.
- **The chat list keeps up.** On phone and desktop the list refreshes on the same schedule, so a chat with a new message moves to the top with the newest preview and unread count. On desktop, the chat that's open in the right pane doesn't show an unread badge.
- **No jumping while you read.** If you've scrolled up, new messages don't pull you down; a **New messages** button appears instead. Screen readers announce incoming messages and who sent them.

Supabase Realtime could replace the polling later; for now polling keeps the server on plain `pg` with no extra setup.

**Try it by hand with two windows:**
1. In a normal browser window, sign in as **Avery Hansen** (Tuesday Crew) and open the chat **Tuesday Crew + Sunday Summit Club**.
2. In a private window (it keeps its own session), sign in as **Maya Patel** (`maya@example.com`) and open the same chat.
3. Send a message as Maya. Within about 5 seconds it appears in Avery's window. Reply as Avery and watch it arrive in Maya's.
4. In Avery's window, go back to Messages (on desktop the list is already next to the chat) and **Accept** one of the requests in the purple box, so a newer chat sits on top. Then send another message as Maya. Within about 5 seconds, Tuesday Crew + Sunday Summit Club moves back to the top of Avery's list with Maya's message as the preview.

Run `npm run db:reset` afterwards to put the requests back (check with the team first, because it resets the shared database).

You can also check it automatically. With `npm run dev` running, run `npm run verify:chat`. It posts a message as a member of the other group in Avery's least recently active chat (Tuesday Crew + Sunday Summit Club on the seed data), polls with `?after=` the way an open chat does, checks that the chat moves to the top of the list with the new preview, checks the database rows, and prints `PASS`/`FAIL` for each step. On a fresh seed Avery has only that one chat, so there's no re-sort to see until you Accept a request (or run `npm run verify:slice`) first. It really posts a message, which stays as that chat's newest preview, and it marks the chat read, which clears the seeded unread badge. Coordinate with the team before running it on the shared database; `npm run db:reset` restores the demo data.

## Logo

aura's logo is a purple flame next to the "aura" wordmark. `client/src/components/FlameMark.jsx` draws it as an inline SVG (purple gradient, light inner flame) beside the wordmark on Sign in / Sign up, the phone Find header and the desktop sidebar. It's decorative (`aria-hidden`), so screen readers still just hear "aura". The browser tab icon (`client/public/favicon.svg`) is the white flame on the brand purple (`#5B3DF5`). Lighthouse Accessibility stays 100 on Sign in, Sign up and Find (phone + desktop).

## Photos and Long Names on Find

From the design review: VoiceOver struggled with the images on Find, and long names ran off the card.

- **Real photos with alt text.** The Find card shows the group photo, or up to 3 members' pictures (uploaded photos first), each described as "<name>, a member of <group>". Member avatars on the card and in the profile sheet use the person's photo too (marked decorative, since their name is right next to it). The profile sheet shows each uploaded photo as "<name>'s photo 1", "photo 2" and so on. The API sends each member's main photo as `photoUrl` in group cards (and for chat senders, readers and friends); people without one get their illustrated avatar.
- **Groups with no photos yet.** The hero shows members' illustrated avatars (each with alt text), so there's no "[Group photo]" placeholder anymore. The profile sheet shows only uploaded photos.
- **Long names.** Group names wrap, even a single 40-plus-letter word. The city tag and member names shorten with "…" (the full name is still read out and shown on hover), and long names in the profile sheet wrap. Checked on phone (375px) and desktop (1280px) with a 60-character group name, a 43-letter one-word name and a long hyphenated person's name: nothing runs off the card, and axe finds no accessibility problems.

## Connect and Pass on Find

In two rounds of user testing, people found swiping confusing and thought Connect meant joining the other group. Find now makes it clear:

- **Labeled buttons.** Every card has **Pass** and **Connect** buttons. Screen readers hear the group's name too ("Connect with Film Fridays").
- **Swipe as a shortcut.** On touch screens, swipe a card right to connect or left to pass. A "Connect" or "Pass" stamp appears once you've dragged far enough, and a short or mostly vertical drag does nothing, so scrolling still works. Mouse drags are ignored, so text on desktop stays selectable.
- **Who you're choosing for.** One short line above the card says "For *your group*" with a **How it works** link (the explainer says Connect means your group wants to meet theirs, not that you join it). After a Connect, the toast says "Sent for *your group*!"
- **First-time explainer.** The first time someone opens Find, a **How Find works** sheet opens: "Like a dating app, but for friend groups", plus what Connect, a match and Pass mean. **Got it** closes it for good on that browser (saved in `localStorage` as `aura.findExplainerSeen`), and the **How it works** link reopens it anytime.

Lighthouse Accessibility on Find is 100 on phone and desktop, with the explainer open and closed.

**Try it by hand.** Open the app in a private window and sign in: the explainer opens on Find. Close it, reload, and it stays closed. On a phone (or Chrome DevTools' device mode), drag the card sideways.

### Your Own Groups

People can be in more than one friend group, so aura makes sure no one is ever offered a match with their own group:

- **Find** never recommends a group you're in.
- **Groups that liked you** hides a request that came from another group you're in. For example, if Avery is in Tuesday Crew and Wednesday Volleyball and someone in Wednesday Volleyball likes Tuesday Crew, Avery doesn't see that request. Tuesday Crew members who aren't in Wednesday Volleyball still see it and can accept or decline.
- **Accepting or connecting anyway** (for example from an old screen) is rejected with `400 OWN_GROUP`.

With `npm run dev` running, `npm run verify:own-groups` checks all of this. If it has to add a test request, it removes it again, so the data is left as it was.

## Profile Photos

Everyone has **1 main photo + up to 3 more**, on the Profile page and in profile setup.

- **Main photo.** It's shown big at the top of the profile, above the name and bio, and it's the person's avatar everywhere else: Find member lists, the member profile sheet, chat messages, read receipts and group member stacks. The first photo you add becomes your main photo. Tap any other photo → **Make main photo** to swap it with the current main photo; removing the main photo moves the next one up. In the database, the main photo is `user_photos.position = 1` and the 3 more are positions 2–4 (migration `006_main_photo.sql`; the unique `(user_id, position)` is `DEFERRABLE` so a swap is one `UPDATE`).
- **Other people's profiles.** Tap a member on a Find card: their main photo is big on top and their 3 more sit under it, so the layout is the same on every profile. A slot they haven't filled says "No photo yet" (most demo people have no uploaded photos, so all 3 show that).
- **Illustrated avatars.** Anyone without an uploaded main photo (including all the demo people, whose photos are labels only) gets an illustrated avatar instead of a blank box or initials. It's drawn in the browser from their user id with DiceBear's "Personas" style (`client/src/illustrated.js`), so the same person always looks the same; nothing is fetched or stored. Personas is by Draftbit, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), via [DiceBear](https://www.dicebear.com/styles/personas/).
- **Picking a photo.** **Add photo** opens the camera roll (or camera) on phones and the file picker on computers. JPEG, PNG and WebP up to 5 MB are accepted; iPhones convert HEIC photos to JPEG automatically. A wrong type or a file that's too big gets a clear message right away, before anything uploads.
- **While it uploads.** The photo appears in its slot, dimmed, with a spinner and "Uploading…". When the server answers, it's replaced by the saved photo. If the upload fails, a friendly message explains why and nothing half-saved is left behind.
- **Where it's stored.** The app sends the image file as the request body to `POST /api/me/photos/upload`. The server checks the type, size and free slot (max 4: 1 main + 3 more), uploads the file to the public Supabase Storage bucket `profile-photos` (path `<user id>/<random id>.<ext>`), and saves its public URL in `user_photos.image_url`. `DELETE /api/me/photos/:id` removes the row and the file. The server calls Storage's REST API with `fetch` (`server/src/lib/storage.js`), so no Supabase client library is needed.
- **Setup.** In Supabase, create a **public** bucket named `profile-photos` (done for Find Friends App). Then set `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API Keys → service_role) in `server/.env` locally and on the API service in Render; it uses the same `SUPABASE_URL` as sign-in. The service_role key is secret: never commit it or put it in the client. Without these settings, uploads answer `503 UPLOADS_NOT_SET_UP` and the rest of the app keeps working.
- **Accessibility.** Each photo is a labeled button that opens its options ("Avery's main photo. Photo options"), photos in the options sheet and on member profiles have alt text ("Avery's main photo"), the upload status is announced (`role="status"`), and errors use `role="alert"`. Lighthouse Accessibility on Profile is 100 on phone and desktop with real photos.

**Try it by hand.** Sign in as anyone, open Profile: a demo person shows their illustrated avatar. Tap it → **Upload a new main photo** and pick an image. It shows "Uploading…", then your photo big at the top (and as your avatar in Find and chats). Tap one of the 3 below → **Make main photo** to swap. In Supabase → Storage → `profile-photos` you'll see the file in a folder named after the user's id, and in the `user_photos` table its `image_url`.

## Group Photo

A group's **owner** can upload, replace or remove the group photo in **Profile → Manage group → Group photo** (it saves right away, separate from "Save changes"). Other members see it there with "Only the group's owner can change the group photo".

- **Where it shows.** As the hero of the group's card on Find (instead of members' photos), on the group's avatar in Messages (chat rows, "Groups that liked you") and in the chat header, and on Profile → My groups. Groups without one keep their initials and the members' photos.
- **API.** `PUT /api/groups/:id/photo` with the image file as the body (JPEG, PNG or WebP, up to 5 MB) and `DELETE /api/groups/:id/photo`; both answer with the updated group card. Anyone but the owner gets `403 OWNER_REQUIRED`. The file goes to the same `profile-photos` bucket under `groups/<group id>/`, and replacing or removing the photo deletes the old file. Group cards and chat rows send it as `photoUrl`.
- **Database.** `friend_groups.photo_url` (migration `007_group_photo.sql`, additive). Run `npm run db:migrate` once on the shared database after merging.

**Try it by hand.** Sign in as Avery (owner of Tuesday Crew) → Profile → Manage group → **Upload photo**. Then sign in as Maya: Messages and the Tuesday Crew chat header show it.

## Onboarding and Sign Up

A new person can't reach Find, Messages or Profile until they have a complete profile and a group (business rules 1 and 4):

1. **Sign up** (name, city, email, password) creates the Supabase login and the `users` row.
2. **Build your profile** (step 1 of 2): a photo, an interest, a short bio, age, gender, relationship status and a personality trait. A checklist ticks off as each one is done. Until then, creating or joining a group answers `403 PROFILE_INCOMPLETE`.
3. **One more thing** (step 2 of 2): "You need to be in a friend group before you can use aura", with **Create a group** and **Join with code**. Every group-scoped endpoint answers `403 NO_GROUP` until then. Creating a group goes to an **Invite your friends** screen (code, link, add friends), then into the app.

**Joining by code.** People can type the code or paste the whole invite link; spaces, dashes and lower case don't matter (`summit-77` works). Errors show under the field and are announced to screen readers:

| What was entered | Message |
|---|---|
| Nothing | "Enter the invite code your friend sent you." |
| Not 4-12 letters and numbers | "Invite codes are 4 to 12 letters and numbers, like SUMMIT77." (`400 INVALID_INVITE_CODE`) |
| A code no group has | "No group has the invite code NOPE1234. Check it with your friend, or create your own group." (`404 INVITE_NOT_FOUND`) |
| A full group's code | "That group already has 10 members, so no one else can join." (`409 GROUP_FULL`) |

**Try it by hand.** Sign up with a new email, fill in the profile, then on "One more thing" choose **Join with code**: try `NOPE1234`, then `SPIKE010` (Wednesday Volleyball is full), then `SUMMIT77` to join Sunday Summit Club and land on Find.

## Manage Group

Profile → tap one of **My groups** opens **Manage group** (a sheet on phones, a dialog on desktop):

- **Details:** group name (required, up to 60 characters) and city (required, up to 80; Find ranks same-city groups first). Each field shows a live count like "12/60", and a blank one says "Group name can't be empty." under the field before anything is sent. The server checks the same rules (`400 VALIDATION_ERROR`). **Save changes** saves both.
- **Group photo:** the owner uploads, replaces or removes it (see [Group Photo](#group-photo)); it saves right away.
- **Members · n of 10:** the owner can **Remove** anyone else (confirmed first); the sheet stays open and the count updates. Others see "Only the group's owner can remove members."
- **Add members:** the invite code and link, plus **Add** next to each friend. At 10 of 10 it says "*Group* is full (10 of 10)…" and the Add buttons are disabled; the database's `group_member_cap` trigger still rejects an 11th member (`409 GROUP_FULL`) if two people add at once.
- **Leave group:** confirmed first. If the owner leaves, the longest-standing member becomes the owner (the confirm says who), so someone can still manage the group. The last member leaving deletes the group.
- **Long names** wrap instead of overflowing: group and member names, the sheet title and the full-group notice.

**Try it by hand.** Sign in as Avery → Profile → Tuesday Crew: change the city and save, remove a member, add them back from **Add members**. Sign in as Chloe → Wednesday Volleyball shows the full notice.

## Decluttered Mobile Screens

Sprint 2 review feedback was "too many words", "very crowded" and "less scrolling". On a 390px-wide phone:

- **Find.** The whole card (photos, name, place, 3 interests + "+N", members) fits above **Pass / Connect**, so the bar never covers the members. The hero shows the group photo or up to 3 members' pictures (main photo or illustrated avatar), never "[Group photo]". The location shows once ("Provo, UT · 1.1 mi away"), members are one swipeable row of pictures and first names (tap for their profile), and the long "You're choosing for…" note is now "For *your group* · How it works".
- **Profile.** About 1.6 screens instead of 2.3: one header card (main photo, name, city, about-me in one line, bio, 3 more photos), interests as plain chips with an **Edit** sheet to add or remove them (no more × on every chip), and each of My groups is one compact card: tap it to manage the group, **…** for Invite friends / Make active group / Manage group.
- **Messages.** Select all, archive and delete live behind one **Edit** button (archive/delete stay disabled until a chat is picked; **Done** leaves). **Archived** and **Recently deleted** are links under the list. Request cards and chat rows are tighter.
- **Onboarding.** The red "Still needed…" warning is now a checklist that ticks off as you go; interests show 8 suggestions + **More**.
- **Tab bar.** Slimmer (62px), and every screen leaves room for it plus the iPhone home bar (`env(safe-area-inset-bottom)`), so content never ends up hidden behind it.

Checked on phone and desktop: Lighthouse Accessibility 100 on Find, Messages, Profile and onboarding.

## Final Presentation Demo

The 5-minute live demo (who says what, the setup checklist, what to tap on each page, backups, and how to clean test groups off the live data before demo day) is in [`docs/demo-script.md`](docs/demo-script.md).

## Accessibility QA

Lighthouse Accessibility is **100 on every page**, phone and desktop: sign in, onboarding, Find, Messages, Chat, Profile, Admin portal and OKR Dashboard (Definition of Done: 90+). The live site has 0 axe-core WCAG A/AA violations, and every page passes the 375px / 1280px checks (no sideways scrolling, no overflowing text, 44px buttons, Find card above Pass / Connect). Scores and method: [`docs/accessibility-qa.md`](docs/accessibility-qa.md).

## Read Receipts

Under an open chat's messages, small avatars show who has read how far, the way Messenger does.

- **Avatars under the last message each person has read.** Up to five show, then `+N`; hover to see every name. You don't see your own, and nobody's avatar sits under a message they sent themselves.
- **"Delivered" under your latest message** until someone else reads it. Then their avatar replaces it.
- **Stays current.** Receipts come from `chat_participants.last_read_at`, returned as `reads` by `GET /api/chats/:id/messages` when a chat opens and on every ~5 second poll, so they update without a reload. There's no new table or column.
- **Honest for new members.** `last_read_at` starts equal to `joined_at`, and that counts as not having opened the chat, so someone who just joined a group doesn't appear to have read the older messages.
- **Screen readers.** Each receipt reads "Read by Maya, Theo" when you move through the messages. Receipts aren't announced as they change; only new messages are.

**Try it by hand with two windows:**
1. In a normal window, sign in as **Avery Hansen** and open **Tuesday Crew + Sunday Summit Club**. Send a message: it says **Delivered**.
2. In a private window, sign in as **Maya Patel** and open the same chat.
3. Within about 5 seconds, Avery's **Delivered** becomes Maya's avatar.

You can also check it automatically. With `npm run dev` running, run `npm run verify:receipts`. It posts a real message as Avery and marks the chat read for Avery and for someone in the other group, so coordinate with the team before running it on the shared database. `npm run db:reset` restores the demo data, again only if the team agrees.

## Typing Indicator

While someone types in a chat, the other members see "Avery is typing…" with three bouncing dots at the bottom of the conversation.

- **Shows up within a few seconds.** While you type, your message box pings `POST /api/chats/:id/typing` at most once a second, which stores the time in `chat_participants.typing_at`. The open chat's regular poll returns `typing` (who, and how long until it runs out), so the others see you on their next poll, within about 5 seconds.
- **Goes away about 5 seconds after you stop.** The server counts someone as typing for 5 seconds after their last ping, and each browser counts that down itself, so it clears between polls too. Sending the message, clearing the box (`DELETE /api/chats/:id/typing`) or leaving the chat clears it straight away.
- **Doesn't flicker.** While someone in the chat is typing, the open chat polls every 2 seconds instead of 5, so a fresh ping always arrives before the last one runs out. It goes back to every 5 seconds when nobody is typing.
- **Several people.** "Avery and Maya are typing…", then "Avery, Maya and Theo are typing…", then "Avery, Maya and 2 others are typing…". You never see yourself.
- **Screen readers and reduced motion.** The same sentence is a `role="status"` message outside the message log, so it's announced politely without being read out as a chat message. With reduced motion turned on, the dots stand still.

**Try it by hand with two windows:** sign in as **Avery Hansen** in one window and **Maya Patel** in a private window, and open **Tuesday Crew + Sunday Summit Club** in both. Start typing as Maya: within about 5 seconds Avery sees "Maya is typing…". Stop typing and it disappears about 5 seconds later; send the message instead and it's replaced by the message.

The shared database needs the new column first: run `npm run db:migrate` (it runs `db/migrations/004_typing_indicator.sql`, which only adds the column) before the API that uses it is deployed. `npm run verify:typing` checks it end to end; it posts one real message, so coordinate with the team before running it on the shared database.

## AI Conversation Starters

When two groups match, an AI step writes three short conversation starters for their new chat, so nobody has to come up with the first message. This is the first slice of our AI workflow automation; the full workflow card is in the Sprint 3 backlog.

- **What happens on a match.** Once the match and its chat are saved, the server sends both groups' names, cities and interests, plus the interests they have in common, to Google's Gemini API and asks for three starters as structured JSON. It then checks the answer: exactly three, all different, one line each, 120 characters or fewer, no links, emoji removed. Only an answer that passes is saved, as three rows in `chat_suggestions` (`chat_id`, `text`, `used_at`). It isn't a pass-through: people never write the prompt, and nothing the model says reaches the app unchecked.
- **"Need an opener?" chips.** A chat where the two groups haven't both said something yet shows the starters as chips above the message box. Tap one and it's in the message box, ready to edit or send. Sending it marks that starter used (`used_at`), and its chip goes away for everyone in the chat.
- **Gone once both groups have chatted.** That's the same "both groups have sent a message" that KR3 counts. Until then the unused ones stay, for both groups. They also step aside while you type a message of your own, so a tap never replaces something you wrote.
- **Nothing waits on the AI.** The call runs in the background after the match is saved (`queueSuggestions` in `server/src/lib/suggestions.js`), so Accept and Connect are as fast as before. A chat opened in that moment shows placeholder chips and checks every 1.5 seconds until the starters arrive.
- **It falls back gracefully.** With no key, or when the call fails, times out (8 seconds, tried twice) or returns something unusable, the match and the chat work exactly as before; the chat just has no chips. The server logs why in a line starting with `AI openers:`.
- **What leaves the server.** Only the two groups' names, cities and interests. No member names, profiles or messages. The request tells Google not to store the exchange; on Gemini's free tier Google may still use what's sent to improve its products, which is one more reason nothing personal is sent.
- **The key.** `GEMINI_API_KEY` is read only by the API: from Render's **Environment** tab on the live app, from `server/.env` locally. It's never in the repo or the browser. `GET /api/health` reports `"aiOpeners": true` when the API has one. The model is `gemini-3.5-flash-lite`; set `GEMINI_MODEL` to use another.
- **Screen readers and keyboard.** The chips are a group of buttons labelled "Need an opener?", between the messages and the message box in tab order. Choosing one moves focus to the message box. While the starters are being written, a `role="status"` message says "Finding openers…".

**Try it by hand:**
1. Sign in as **Avery Hansen** (`avery@example.com`; see [Demo accounts](#sign-in-and-demo-accounts)), go to Messages and **Accept** Court Crew. Open the new chat: three chips appear under "Need an opener?".
2. Tap one. It's now in the message box; change it if you like and press Send. Its chip disappears and the other two stay.
3. In a private window (it keeps its own session), sign in as **Grace Lee** (`grace@example.com`, Court Crew) and open the same chat. She sees Avery's message and the two chips that are left. Send any message as Grace: within about 5 seconds the chips are gone in both windows.
4. In Supabase's **Table Editor**, `chat_suggestions` has three rows for that chat, and the one Avery sent has `used_at` filled in.

The shared database needs the new table first: run `npm run db:migrate` (it runs `db/migrations/005_chat_suggestions.sql`, which only adds the table) before the API that uses it is deployed. The migration creates the table as the role that owns the other tables (`aura_app`), whichever database login runs it, so the API can use it and a later `db:reset` can drop it. Matches made before that have no starters.

**Check it automatically.**
- `npm run verify:suggestions -- --ai` asks the AI for starters for an existing match and prints them along with what it was told. It saves nothing and doesn't need `npm run dev`, so it's safe on the shared database. It needs `GEMINI_API_KEY` in `server/.env` and uses one Gemini request.
- With `npm run dev` running, `npm run verify:suggestions` checks the whole flow: Accept returns without waiting for the AI, three rows are saved, both groups are offered the same three, sending one sets its `used_at`, and none are offered once both groups have chatted. If the API has no key, it checks the fallback instead. It really accepts a request and posts two messages, so coordinate with the team before running it on the shared database; `npm run db:reset` restores the demo data.

## Message Validation

The server checks every message before saving it (`readMessage` in `server/src/lib/validate.js`), so a bad message can't get into the database even when it skips the app, for example from a script or a pasted request.

- **Cleaned before saving.** Spaces and newlines at the start and end are trimmed, Windows line endings become `\n`, and invisible control characters (such as `\u0000`, which Postgres can't store) are removed.
- **Rejected with `400 VALIDATION_ERROR`:** a missing body, anything that isn't text, a message with nothing visible in it (only spaces, newlines, zero-width spaces or control characters), and a message over 2000 characters. Length is counted the way Postgres counts it, so an emoji is one character. The error's `details` say which field failed (`body`), the limit, and for long messages the actual length.
- **Shown in the chat, not as a pop-up.** If a send fails, the reason appears right above the message box, the box gets a red outline, and what you typed stays there so you can fix it. Screen readers announce it (`role="alert"`, linked to the box with `aria-describedby`). It goes away as soon as you start typing.
- **Database backstop.** The `messages.body` check constraint still rejects blank or too-long text, and Postgres "can't store this character" errors are mapped to `400` instead of `500` for every field (`server/src/errors.js`).

**Check it automatically.** With `npm run dev` running, run `npm run verify:messages`. It sends empty, whitespace-only, zero-width-only, `\u0000`, too-long, missing and non-text messages, checks each gets `400 VALIDATION_ERROR`, confirms none of them saved a row, and checks that 2000 emoji aren't rejected for length. It saves nothing, so it's safe on the shared database. `npm run verify:messages -- --post` also sends two real messages and checks they're saved trimmed and cleaned; those stay in Avery's chat until the next `npm run db:reset`.

**Try it by hand.** Open a chat as Avery Hansen. In DevTools, remove the `maxlength` attribute from the message box, paste in more than 2000 characters and press Send. The message appears above the box ("Messages can be up to 2000 characters. This one is 2050."), and your text is still in the box.

## Friendly Error Messages

On Messages and in a chat, errors are written for people, not developers. Nobody sees "Request failed (500)" or "Is `npm run dev` running?".

- **One place for the wording.** `friendlyError(err)` in `client/src/friendlyError.js` turns an API error into plain text: a lost connection becomes "We can't reach aura right now…", a server error becomes "Something went wrong on our end…", and codes like `GROUP_FULL`, `CHAT_FULL`, `NOT_ACTIVE_GROUP` and `NOT_IN_CHAT` get their own explanations. The API's 400-range messages (like "Message can't be empty.") are already written for people, so they pass through. To change a message, edit that file.
- **Try again only when it can help.** `canRetry(err)` is true for a lost connection or a 5xx. Then a failed chat shows **Try again**, and a failed send shows **Try again** next to the error above the message box, which sends your typed text again. A 4xx (a bad message, a chat you've left) gets no retry button, because sending the same thing again won't work. "Couldn't load messages" already had **Try again**.

**Try it by hand.** In Chrome DevTools, open **Network** and set throttling to **Offline**. Type a message and press Send: "We can't reach aura right now…" appears above the box with **Try again**, and your text stays. Set throttling back to **No throttling** and click **Try again**: the message sends.

## Loading States

While a screen waits for the API, it shows something that moves instead of a static "Loading…".

- **Skeleton rows where we know the layout.** The chat list, the "Groups that liked you" box and the inside of a chat show gray placeholder rows (avatars, lines of text, message bubbles) with a soft shimmer. They use the same CSS classes as the real rows, so the page doesn't jump when the data arrives. The likes box shows as many placeholder rows as the group had requests last time, and none if it had none (one on the first visit).
- **Spinners everywhere else.** Starting the app, Find and the Invite friends list show a spinner with a label. Accept and Decline show a spinner inside the button you pressed until the server answers, and the button keeps its size.
- **Reduced motion.** When the device asks for less motion (for example **Reduce motion** on macOS or iOS), the shimmer and the spinners stand still. The `prefers-reduced-motion` rule in `client/src/styles.css` turns off every animation in the app.
- **Screen readers.** The area that's loading is marked `aria-busy="true"`, and a `role="status"` message such as "Loading chats…", "Opening chat…" or "Finding groups for Tuesday Crew…" is announced. The message goes in 0.3 seconds after the placeholder appears, because screen readers announce changes to a status message that's already on the page, not one that arrives with its text. Loads faster than that aren't announced.

The shared pieces are in `client/src/components/Loading.jsx`: `Skeleton`, `Spinner`, `Loader` (spinner and label) and `LoadingStatus`.

**Try it by hand:**
1. In Chrome DevTools, open the **Network** tab and set throttling to **Slow 4G**. Open Messages, then a chat: the skeletons show for a second or two before the real rows replace them.
2. For reduced motion, open DevTools **⋮ → More tools → Rendering** and set **Emulate CSS media feature prefers-reduced-motion** to `reduce`. The placeholders stay still.
3. With throttling still on, turn on VoiceOver (Cmd+F5 on a Mac) and open Messages. VoiceOver says "Loading chats".
