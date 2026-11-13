# Final presentation: live demo script

A 5-minute live demo of aura for the industry guests: all 5 pages, the AI conversation starters, the "We met up!" button and the OKR Dashboard. Live only: no screenshots or recordings, except the backup at the end.

## Who does what

| Time | Part | Who |
|---|---|---|
| 0:00–0:45 | The problem, and how aura got here (PRD → user feedback → sprint changes) | Julian |
| 0:45–3:15 | Live demo: sign up → Find → match → chat → Profile / Manage group | Clint |
| 3:15–4:15 | AI conversation starters + automation | Julian |
| 4:15–5:00 | Admin portal + OKR Dashboard: the numbers move because of what we just did | David |

## The night before (setup checklist)

1. **Clean the live data** (see "Demo data cleanup" below). Test groups like "LEBRONN" and "Your Mom" currently show up on Find for any new group.
2. **Stage one match** so Connect makes a match on stage, not just "Sent". Use two fresh accounts so nothing that happened earlier on the shared database gets in the way (no one in both groups, no earlier Connect or Pass):
   - Account A (e.g. `stage.a@example.com`): finish the profile, create **"Thursday Climbers"** with interests Climbing, Hiking, Coffee. Add a couple of friends to it if you can (KR2 counts groups with 4+ people).
   - Account B (e.g. `stage.b@example.com`): finish the profile with the **same interests** (so it ranks at the top of A's Find), create **"Board Game Night"**, go to Find and tap **Connect** on Thursday Climbers.
   - Sign in as A and open Find: Board Game Night is there with **"Wants to meet you"**. Don't tap anything. Leave A signed in in a second browser profile for the demo.
3. **Pick the sign-up account.** A third brand-new email for the on-stage sign-up (e.g. `demo.live@example.com`), plus a real-looking photo on the phone to upload. Write all three accounts down.
4. **Admin:** David's account must have `is_admin = true` (already set in the SQL Editor). Check that `#/admin/okrs` loads.
5. **QR code + short link** to https://aura-is401.onrender.com on the title slide (Julian's card).
6. Rehearse twice, timed, under 5:00.

## 10 minutes before

- Open https://aura-is401-api.onrender.com/api/health and wait for `{"ok":true,"aiOpeners":true}`. The free server sleeps after 15 minutes idle and takes up to a minute to wake.
- Open the live site on the presenting phone (or desktop at phone width) for the sign-up, and have account A (Thursday Climbers) already signed in in a second browser profile, so you never type a password on stage.
- Turn on Do Not Disturb.

## The live demo (Clint, about 2:30)

**1. Sign up and onboarding (0:40)**
- Scan the QR code / open the link → **Sign up** with the new email.
- "This profile is about you. Groups come next." Point at the **checklist**: it ticks off as you go.
- Tap **Add a main photo** on the illustrated avatar → pick the photo (the iPhone photo picker works). It becomes the big main photo. Pick 2 interests from the 8 suggestions. Fill age, gender, relationship status, a trait → **Save and continue**.
- **Create a group** (e.g. "Demo Day Crew") → the invite screen shows the code and **Copy link**.
- *Say:* "Friend groups, not individuals. Your group's interests are everyone's interests combined."

**2. Find (0:40)** (switch to account A's browser)
- Find shows **Board Game Night** with **"Wants to meet you"**. Point out: the whole card fits above Pass / Connect, the shared interests with checkmarks, the members row. Tap a member to show their profile (main photo, other photos).
- Tap **Connect** → "It's a match with Board Game Night!" → **Open**.
- *Say:* "Both groups have to say yes. Then everyone in both groups lands in one group chat."

**3. Chat + AI (0:40)**
- The new chat shows **"Need an opener?"** with 3 AI starters written from both groups' interests. Tap one → it's in the box → send.
- Point out read receipts (the little avatars under the message) and the **"We met up!"** button. Tap it and confirm.
- *Hand off to Julian for the AI part.*

**4. Profile / Manage group (0:30)**
- Profile: main photo big on top, 3 more under it (tap one → **Make main photo**), about-me in one line.
- Tap the group card → **Manage group**: group photo (owner can upload / replace / remove), members, invite.

## Admin + OKRs (David, about 0:45)

- Sidebar → **Admin portal** → **OKR Dashboard** → **Refresh**.
- KR1 (groups that connect) and KR4 (connected groups that meet up) just went up from the match and the "We met up!" tap on stage. Every number is counted live from the database; nothing is typed in by hand.

## If something goes wrong

| Problem | Do this |
|---|---|
| "Can't load aura" / spinner forever | The server is waking up. Talk through the slide for 30 seconds, then tap **Try again**. |
| No AI openers in the new chat | The AI call failed or is slow; the app keeps working without them. Say so and move on. |
| Connect says "Sent" instead of a match | The staged Connect from Board Game Night didn't happen. Open Messages → any existing chat and keep going. |
| Wi-Fi is down | Play the Key Results video (Julian's card) as the backup. |

## Demo data cleanup

Find for a brand-new group currently shows 1-person test groups ("hooray", "Your Mom", 5 × "LEBRONN", "Bears Eats Beets", and others). The team needs to agree before deleting anything: deleting groups also removes their memberships, likes, matches and chats, and it **changes the OKR numbers** (the dashboard counts every group).

In Supabase's SQL Editor, **preview first**:

```sql
-- Groups that aren't the 5 seeded demo groups, with their size and owner.
SELECT g.id, g.name, count(m.user_id) AS members, u.first_name AS owner, g.created_at
FROM friend_groups g
LEFT JOIN group_memberships m ON m.group_id = g.id
LEFT JOIN users u ON u.id = g.created_by
WHERE g.id > 5
GROUP BY g.id, u.first_name
ORDER BY members, g.created_at;
```

Then delete only the ids the team agrees are junk (an active group that's deleted just becomes "no active group" for its members):

```sql
DELETE FROM friend_groups WHERE id IN ( /* ids from the preview */ );
```

Afterwards, run `npm run db:migrate` (it prints the new OKR percentages) and check the OKR Dashboard.
