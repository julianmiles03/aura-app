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

Each slice works end to end: a screen in the app, an API endpoint, and rows in Postgres, live at the URL above. **Target for Sprint 2: 10. Working now: 16.**

| # | Slice | What the user does | API | Database |
|---|---|---|---|---|
| 1 | Sign up and sign in | **Sign up** (name, city, email, password) goes straight to profile setup; returning users use **Sign in** ("Already have an account?") | Supabase Auth, then `POST /api/users`; every request sends the session as `Authorization: Bearer` | `auth.users`, `users.auth_user_id` |
| 2 | Profile and interests | Profile → edit bio, details and interests | `PATCH /api/me` | `users`, `user_interests` (group interests update through the `group_shared_interests` view) |
| 3 | Profile photos | Profile (or profile setup) → **Add photo** → pick an image; it uploads with a preview. Tap a photo → **Make main photo** or **Remove photo** (any but the last) | `POST /api/me/photos/upload`, `POST /api/me/photos/:id/main`, `DELETE /api/me/photos/:id` | `user_photos.image_url` + Supabase Storage bucket `profile-photos` |
| 4 | Onboarding gate | A user with no group sees "Create or join a group" instead of the app | any group endpoint → `403 NO_GROUP` | `group_memberships` |
| 5 | Create a group | Gate or Profile → **Create a group** | `POST /api/groups` | `friend_groups`, `group_memberships`, `users.active_group_id` |
| 6 | Join with an invite code | Enter a code; a full group shows "already has 10 members" | `POST /api/groups/join` → `409 GROUP_FULL` when full | `group_memberships` (`group_member_cap` trigger) |
| 7 | Invite a friend to your group | Profile → **Invite friends** → pick a friend | `GET /api/me/friends`, `POST /api/groups/:id/members` | `friendships`, `group_memberships`, `chat_participants` |
| 8 | Edit group and leave group | Profile → edit group name, or **Leave group** | `PATCH /api/groups/:id`, `DELETE /api/groups/:id/members/me` | `friend_groups`, `group_memberships`, `chat_participants` |
| 9 | Switch active group | Group switcher on Find, "Chatting as" on Messages, or Profile → a group's **…** → **Make active group** | `PATCH /api/me/active-group` | `users.active_group_id` (composite FK to memberships) |
| 10 | Find, Connect and Pass | Find shows one ranked group at a time; **Connect** or **Pass** loads the next | `GET /api/recommendations`, `POST /api/groups/:id/likes` | `group_likes`; a mutual Connect creates the match and chat |
| 11 | Accept or decline a request | Messages → "Groups that liked you" → **Accept** (new chat appears) or decline | `GET /api/groups/:id/incoming-likes`, `POST /api/likes/:id/accept`, `POST /api/likes/:id/decline` | `group_likes`, `group_matches`, `chats`, `chat_participants` in one transaction |
| 12 | Group chat with live updates | Open a chat, send a message; the other group sees it within ~5 seconds | `GET /api/chats/:id/messages?after=`, `POST /api/chats/:id/messages` | `messages`, `chat_participants.last_read_at` |
| 13 | Archive, delete and restore chats | Messages → **Edit** → pick chats (or **Select all**) → archive / delete; **Archived** / **Recently deleted** links under the list to unarchive / restore | `GET /api/groups/:id/chats?view=`, `POST /api/chats/bulk` | `chat_participants` (per-person archived/deleted state) |
| 14 | Read receipts | Open a chat: small avatars show who has read how far, and your latest message says **Delivered** until someone reads it | `GET /api/chats/:id/messages` (`reads`) | `chat_participants.last_read_at`, `messages` |
| 15 | Typing indicator | Type in a chat: the other members see "Avery is typing…" within a few seconds, gone about 5 seconds after you stop | `POST`/`DELETE /api/chats/:id/typing`, `GET /api/chats/:id/messages` (`typing`) | `chat_participants.typing_at` |
| 16 | AI conversation starters | Open a new match's chat: three "Need an opener?" chips. Tap one to fill the message box, then send it | On a match the server asks the Gemini API for 3 starters; `GET /api/chats/:id/messages` (`suggestions`), `POST /api/chats/:id/messages` (`suggestionId`) | `chat_suggestions` (`text`, `used_at`) |
| 17 | We met up! | In a match chat, **We met up!** under the header → **Yes, we met up**; both groups then see "You met up on Oct 30" | `POST /api/chats/:id/meetup`, `GET /api/chats/:id/messages` (`meetup`) | `meetups` (feeds KR4) |
| 18 | OKR Dashboard | An admin opens **Admin portal** (on Profile, or in the desktop sidebar) → **OKR Dashboard**: KR1-KR4 against their targets, with the raw counts. **Refresh** reads them again | `GET /api/admin/okrs` (admins only) | `okr_metrics` view, `users.is_admin` |

Slice 11 has a step-by-step walkthrough in [Verifying the Vertical Slice](#verifying-the-vertical-slice), slice 12 in [Live Chat Updates](#live-chat-updates), slice 14 in [Read Receipts](#read-receipts), slice 15 in [Typing Indicator](#typing-indicator), slice 16 in [AI Conversation Starters](#ai-conversation-starters), slice 17 in [OKR Metrics](#okr-metrics), and slice 18 in [OKR Dashboard](#okr-dashboard).

### Sprint 2 JW verification

The Sprint 2 JW-assigned changes are tracked in [`docs/vertical-slice-verification.md`](docs/vertical-slice-verification.md). The tracker covers real sign-up/profile setup, group creation and invite-link joining, Find location and member profiles, removal of the group Status field, matching, and chat. Each row must be re-verified on the deployed URL with a real login before the Trello card is moved to Done.

## System Architecture

![aura system architecture](docs/architecture.png)

- **Customer app:** users use the React website, which sends requests to our Express server. The server saves and loads data in Supabase, which also handles logins. Both run live on Render.
- **AI service:** when two groups match, the server sends both groups' names, cities and interests to Google's Gemini API, which returns three conversation starters for the new chat. See [AI Conversation Starters](#ai-conversation-starters).
- **Admin portal:** part of the same React website (`#/admin`), behind the normal sign-in plus `users.is_admin`. Its OKR Dashboard reads `GET /api/admin/okrs` from our Express server, which counts the KRs live in Supabase (see [OKR Dashboard](#okr-dashboard)). Maintain Users and Maintain Records aren't built yet. The diagram still shows the earlier plan for a separate admin portal hosted on AWS.

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

- **Opening it:** sign in with an admin account (see [below](#admin-dashboard-api) for how to make one), then go to **Profile → Admin portal → OKR Dashboard**. On desktop, **Admin portal** is also in the sidebar. The direct links are [`/#/admin`](https://aura-is401.onrender.com/#/admin) and [`/#/admin/okrs`](https://aura-is401.onrender.com/#/admin/okrs); if you're signed out, they go through Sign in and then open the page. Other users don't get the link, and if they open the URL they see "Admins only" (the API answers them with `403 NOT_ADMIN`). The portal's other two tools, **Maintain Users** and **Maintain Records**, are marked "Coming soon".
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
- **Phone and desktop:** phones get one column. From 1024px wide, the three tools sit side by side and the KR cards are two by two. Lighthouse Accessibility scores 100 on phone and desktop for the portal home, the dashboard (loaded and loading) and the "Admins only" page.

### Admin dashboard API

The [OKR Dashboard](#okr-dashboard) shows the KRs from `GET /api/admin/okrs`. It needs a signed-in user (`Authorization: Bearer`, like every other route) whose `users.is_admin` is `true`; anyone else gets `403 NOT_ADMIN`. `GET /api/me` includes `user.isAdmin`, so the app can tell whether to offer the portal. The numbers are read live from `okr_metrics` on every request (no caching), so refreshing the dashboard after a user action shows the new value. The dashboard is part of the aura website, so the API already allows it. If another site ever calls the API from a browser, add that site's domain to `CORS_ORIGIN` on aura-is401-api (comma-separated), or the browser blocks the request.

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

`pct` is 0-100 with one decimal place, or `null` when `outOf` is 0. `target` is our goal for that KR, as a percentage. To make someone an admin, run this in Supabase's **SQL Editor** (`users.id` is in the Table Editor):

```sql
UPDATE users SET is_admin = true WHERE id = <their users.id>;
```

Notes:
- A percentage is empty (`NULL`) instead of an error when its denominator is 0, for example KR3 and KR4 before any group has matched.
- **Updating an existing database:** schema changes that must keep everyone's other data go in `db/migrations/` as files that are safe to re-run. `npm run db:migrate` runs them all and prints the current KRs. `db/schema.sql` matches the result, so a fresh `npm run db:reset` ends up the same. `001_okr_metrics.sql` adds the OKR table and view; `002_drop_events.sql` removes the events feature (its two tables and their rows); `008_admin.sql` adds `users.is_admin`. All are applied to Find Friends App.

## Tech Stack

| Layer | Choice | Why it fits our team |
|---|---|---|
| Frontend | **React + Vite**, plain CSS (`/client`) | The most widely used UI library, so everyone on the team can contribute. Vite starts in under a second and reloads on save. Plain CSS with design tokens (no UI framework) keeps the mockups' look exact without another thing to learn. |
| Backend | **Node + Express** REST API (`/server`) | The same language as the frontend, so nobody has to switch languages. Express is small enough to read end to end, and each screen maps to a few clear endpoints that return JSON errors like `409 GROUP_FULL`. |
| Database | **PostgreSQL on Supabase**, accessed with `pg` | The free tier covers everything we need at this stage. Supabase's **Table Editor** lets the whole team see rows appear as we click through the app. All four of us point at **one shared database** (the Supabase project Find Friends App), so nobody's local setup drifts and seed data is the same for everyone. We use Supabase only as a Postgres host with plain SQL, so the work stays portable and shows real relational design (constraints, triggers, views). |
| Auth | **Supabase Auth** (email + password) | Supabase already hosts our database, so its Auth service adds real accounts without another vendor. The client uses only the small `@supabase/auth-js` package; the API checks each session token against Supabase's published signing keys (`jose`), so it needs no shared secret, and all app data still goes through our API. |
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
- **`aura-is401`** (static site): the Vite build of the client. `VITE_API_URL` tells it where the API lives, and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` point it at Supabase Auth; all are baked in at build time and are public.
- The API's `SUPABASE_URL` (also public) is where it fetches Supabase's signing keys to check sessions.

Every push or merge to `main` redeploys both automatically (about a minute); nothing to click. To set it up from scratch: Render Dashboard → **New → Blueprint** → pick this repo → paste the Session pooler URI as `DATABASE_URL` and the Gemini key as `GEMINI_API_KEY` → **Apply**. If Render gives either service a different URL (it adds a suffix when a name is taken), update `CORS_ORIGIN` and `VITE_API_URL` to match.

Render only asks for secret values like these when a Blueprint is first created. To add or change one on the running service, open **`aura-is401-api` → Environment**, add the variable and save; Render redeploys the API. `https://aura-is401-api.onrender.com/api/health` shows `"aiOpeners": true` once the API has a Gemini key.

## Sign In and Demo Accounts

Accounts are **Supabase Auth** users (email + password). New visitors see **Sign up**; "Already have an account? Sign in" goes to the separate sign-in page.

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

## Decluttered Mobile Screens

Sprint 2 review feedback was "too many words", "very crowded" and "less scrolling". On a 390px-wide phone:

- **Find.** The whole card (photos, name, place, 3 interests + "+N", members) fits above **Pass / Connect**, so the bar never covers the members. The hero shows the group photo or up to 3 members' pictures (main photo or illustrated avatar), never "[Group photo]". The location shows once ("Provo, UT · 1.1 mi away"), members are one swipeable row of pictures and first names (tap for their profile), and the long "You're choosing for…" note is now "For *your group* · How it works".
- **Profile.** About 1.6 screens instead of 2.3: one header card (main photo, name, city, about-me in one line, bio, 3 more photos), interests as plain chips with an **Edit** sheet to add or remove them (no more × on every chip), and each of My groups is one compact card: tap it to manage the group, **…** for Invite friends / Make active group / Manage group.
- **Messages.** Select all, archive and delete live behind one **Edit** button (archive/delete stay disabled until a chat is picked; **Done** leaves). **Archived** and **Recently deleted** are links under the list. Request cards and chat rows are tighter.
- **Onboarding.** The red "Still needed…" warning is now a checklist that ticks off as you go; interests show 8 suggestions + **More**.
- **Tab bar.** Slimmer (62px), and every screen leaves room for it plus the iPhone home bar (`env(safe-area-inset-bottom)`), so content never ends up hidden behind it.

Checked on phone and desktop: Lighthouse Accessibility 100 on Find, Messages, Profile and onboarding.

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
