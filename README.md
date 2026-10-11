# aura

A mobile-first web app that helps groups of friends find and meet other friend groups. Built by Team Aura: Clint Burton, David Medina, Jaemin Weight and Julian Miles.

## App Summary

Friend groups often want to meet other friend groups and do things together: a game night, a hike, a pickup game. But they don't know where to find those groups or which ones are open to meeting new people. This is common for college students and young adults who have moved to a new city, or whose circle has gotten small, and existing apps match individuals for dating or networking rather than whole groups. aura lets each person build a profile and join or create a Friend Group of up to 10 people, then swipe on one recommended group at a time on behalf of their active group. Recommendations are ranked by shared interests, then mutual friends, then whether the group is in the same city. When one member of each group says "Connect", from Find or by accepting in the "Groups that liked you" inbox, the two groups match and aura automatically opens a shared group chat with everyone from both groups. Each group card also shows the events the group is going to, so it's easy to pick a first plan together.

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

## Tech Stack

| Layer | Choice | Why it fits our team |
|---|---|---|
| Frontend | **React + Vite**, plain CSS (`/client`) | The most widely used UI library, so everyone on the team can contribute. Vite starts in under a second and reloads on save. Plain CSS with design tokens (no UI framework) keeps the mockups' look exact without another thing to learn. |
| Backend | **Node + Express** REST API (`/server`) | The same language as the frontend, so nobody has to switch languages. Express is small enough to read end to end, and each screen maps to a few clear endpoints that return JSON errors like `409 GROUP_FULL`. |
| Database | **PostgreSQL on Supabase**, accessed with `pg` | The free tier covers everything we need at this stage. Supabase's **Table Editor** lets the whole team see rows appear as we click through the app. All four of us point at **one shared database** (the Supabase project Find Friends App), so nobody's local setup drifts and seed data is the same for everyone. We use Supabase only as a Postgres host with plain SQL, so the work stays portable and shows real relational design (constraints, triggers, views). |
| Auth | "Signed in as" picker (prototype) | Real login is out of scope for the prototype. The picker stores a user id in `localStorage` and sends it as an `X-User-Id` header, which keeps demos fast while the server still applies every rule (onboarding gate, membership, active group). |
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
   Open `server/.env` and replace the whole `DATABASE_URL=...` line with `DATABASE_URL=<the string from steps 3–4>`. `server/.env` is git-ignored, so your password never gets committed.

6. **Check the connection.**
   ```bash
   npm run db:check
   ```
   You should see `OK: users table has N rows. Your server/.env is right.` If not, it prints the exact fix (see Troubleshooting below). This check is read-only and safe to run any time.

7. **Start the app.**
   ```bash
   npm run dev
   ```
   This starts the API on http://localhost:4000 and the web app on http://localhost:5173. **Open http://localhost:5173.** On a desktop it renders at phone width; for the true mobile view, use your browser's device toolbar.

The tables and sample data already exist in Find Friends App. `npm run db:reset` rebuilds them from `db/schema.sql` and `db/seed.sql`, but it **wipes everyone's data on the shared database**, so only run it after the team agrees.

**Troubleshooting**
- **`Tenant or user not found`** or **`no tenant identifier provided`**: the username is missing the project ref. It must be `postgres.rcyafwgjnnlgnakwkksi`, not `postgres`. Re-copy the Session pooler URI.
- **`password authentication failed`**: the password is wrong, or it has special characters that aren't percent-encoded. Ask Julian for the current password. Don't reset it.
- **`DATABASE_URL is not set`**: `server/.env` is missing, or still has a placeholder like `<your-db-password>` or `[YOUR-PASSWORD]`.
- **`ENOTFOUND` / `ENETUNREACH` / timeouts**: you copied the Direct connection (`db.….supabase.co`). Use the Session pooler URI instead.
- **`relation "users" does not exist`**: you're connected to the wrong Supabase project. Use Find Friends App.
- The page says it can't reach the server: make sure `npm run dev` is still running.

## Verifying the Vertical Slice

The vertical slice is **Accept** in "Groups that liked you". It goes from the browser through the API into Postgres and back, without a page reload.

1. **Pick a seeded user in "Signed in as."** On the first screen, choose **Avery Hansen** (active group: Tuesday Crew). If you're already in the app, use the "Signed in as" dropdown at the top.
2. **Go to Messages and click Accept on a request.** The purple box says "2 groups want to meet Tuesday Crew" (Court Crew and Film Fridays). Click **Accept** on one of them. The client sends `POST /api/likes/:id/accept`. In one database transaction, the server records Tuesday Crew's "connect", creates the `group_matches` row, creates the `chats` row, and adds every member of both groups to `chat_participants`. It then returns the new chat.
3. **See the new chat appear.** The request disappears from the box, and the new chat, for example "Tuesday Crew + Court Crew · 11 people", appears highlighted at the top of the Chats list with no reload. Tap it to send the first message.
4. **Refresh the page and confirm it's still there.** Press reload. The request stays gone and the chat is still at the top of Chats.
5. **Confirm the new rows in Supabase's Table Editor.** In your Supabase project, open **Table Editor**:
   - `group_matches` has a new row pairing group 1 (Tuesday Crew) with the group you accepted.
   - `chats` has a new row named after both groups, whose `match_id` points to that match.
   - `chat_participants` has a row for each member of both groups (filter by the new `chat_id`).

   The new match and chat have the same timestamp, because they were created in the same transaction.

Run `npm run db:reset` to put the two requests back for the next demo (check with the team first, because it resets the shared database).

You can also check the slice automatically. With `npm run dev` running, run `npm run verify:slice`. It accepts a request as Avery, checks the API response, refetches like a browser refresh would, checks the database rows, and prints `PASS`/`FAIL` for each step. It really accepts a request, so coordinate with the team before running it on the shared database.
