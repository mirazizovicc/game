# Digital Divide Challenge

A real-time, Kahoot-inspired classroom quiz for the presentation
**"The Digital Divide: When Digital Inequality Becomes a Human Rights Issue."**

The presenter projects the host screen; students join on their own phones with a PIN or QR code,
answer seven multiple-choice questions, see the correct answer and an explanation after each one,
watch a live leaderboard, and finish on a gold/silver/bronze podium. The whole activity takes
about 6 minutes.

- **Server-authoritative**: the server owns the game state, the timers, the answer key and every score.
  Browsers only render what the server sends and submit answers.
- **No accounts, no personal data**: students pick a nickname. Nothing else is collected.
- **Two modes, clearly labelled**: a real PostgreSQL/Supabase backend for classroom use, and an
  in-memory *local demo mode* (a banner is shown on every page whenever it is active).

---

## Contents

1. [Technology stack](#1-technology-stack)
2. [Prerequisites](#2-prerequisites)
3. [Installation and local development](#3-installation-and-local-development)
4. [Supabase setup (production backend)](#4-supabase-setup-production-backend)
5. [Database schema and migrations](#5-database-schema-and-migrations)
6. [Environment variables](#6-environment-variables)
7. [Authentication and authorization](#7-authentication-and-authorization)
8. [Real-time design](#8-real-time-design)
9. [Running tests](#9-running-tests)
10. [Production build](#10-production-build)
11. [Deploying to Vercel](#11-deploying-to-vercel)
12. [Running a classroom game](#12-running-a-classroom-game)
13. [Game rules, scoring and policies](#13-game-rules-scoring-and-policies)
14. [Editing the questions](#14-editing-the-questions)
15. [Architecture](#15-architecture)
16. [Troubleshooting](#16-troubleshooting)
17. [Known limitations](#17-known-limitations)

---

## 1. Technology stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, route handlers), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, self-hosted fonts (Bricolage Grotesque, Inter) — no external font requests |
| Database | PostgreSQL (Supabase), accessed **only from the server** via `pg` |
| Validation | Zod (request bodies, quiz content) |
| QR code | `qrcode.react` |
| Tests | Vitest (unit, service, database), Playwright + axe-core (browser, accessibility) |
| Hosting | Vercel-compatible (serverless route handlers, no long-lived processes) |

## 2. Prerequisites

- Node.js **20.9+** (developed on 22) and npm
- For the production backend: a free [Supabase](https://supabase.com) project
- For database tests: PostgreSQL server binaries (`apt install postgresql`) — optional

## 3. Installation and local development

```bash
npm install
cp .env.example .env.local      # optional for demo mode
npm run dev                     # http://localhost:3000
```

With no `DATABASE_URL`, `npm run dev` starts **local demo mode**: games live in the memory of the
dev server. It is perfect for trying the product on one machine, but data is lost on restart and is
not shared between server instances, so **do not use it in a classroom deployment**.

To let real phones join a game hosted from your laptop, open the host page using your laptop's
network address (for example `http://192.168.1.20:3000/host`) or set `NEXT_PUBLIC_APP_URL`,
so the QR code points somewhere phones can reach. The host lobby shows a warning if the QR code would
point to `localhost`.

### Try the real PostgreSQL store locally (no Supabase needed)

```bash
scripts/local-postgres.sh start                    # throwaway Postgres on 127.0.0.1:54329
export DATABASE_URL=postgres://postgres@127.0.0.1:54329/ddc_test DATABASE_SSL=disable
npm run db:migrate
npm run dev
```

## 4. Supabase setup (production backend)

> **Status:** the PostgreSQL store, migration and RLS policy are fully tested against a real
> PostgreSQL 16 server. They have **not** been run against a live Supabase project from this
> repository (no credentials were available when it was built). The steps below are what you do to
> connect it; see [Known limitations](#17-known-limitations).

1. **Create a project** at <https://supabase.com/dashboard> (any region near your classroom).
   Save the database password you choose.
2. **Create the schema.** Either:
   - paste the contents of `supabase/migrations/20261009000000_init.sql` into
     *SQL Editor → New query → Run*; or
   - with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link --project-ref <ref>`
     then `supabase db push`; or
   - from this repo: set `MIGRATE_DATABASE_URL` to the **direct** connection string and run
     `npm run db:migrate` (safe to re-run).
3. **Get the connection string:** *Project Settings → Database → Connection string*.
   Use the **Transaction pooler** string (port `6543`) for Vercel. Put it in `DATABASE_URL`.
4. **TLS:** download the CA certificate (*Database → SSL Configuration*) and set `DATABASE_CA_CERT`
   (newlines may be written as `\n`). If that is impractical, `DATABASE_SSL_NO_VERIFY=true` keeps
   traffic encrypted but does not authenticate the server — an explicit, documented trade-off.
5. **Realtime:** nothing to enable. This app does not use Supabase Realtime (see
   [Real-time design](#8-real-time-design)); you do **not** need to add tables to a publication.
6. **Keys:** the app does **not** use the Supabase anon key or the service-role key at all.
   Do not add either to the project or to Vercel. Only `DATABASE_URL` is needed.

Verify with `GET /api/health` on your deployment: `{"mode":"postgres", ...}`.

## 5. Database schema and migrations

Migration: [`supabase/migrations/20261009000000_init.sql`](supabase/migrations/20261009000000_init.sql)

| Table | Purpose |
| --- | --- |
| `quizzes` | Immutable quiz versions. The id is a content hash, so editing a question creates a new quiz and can never alter a running game. |
| `questions` | Prompt, options (no correctness info), time limit, position. |
| `question_keys` | **The answer key and explanation**, in a separate table so no query on `questions` can leak it. |
| `games` | PIN, status, current question index, `version` (compare-and-set), deadlines, config, **hash** of the host secret, expiry. |
| `players` | Nickname, normalised `nickname_key`, cumulative score, **hash** of the player secret, last-seen. |
| `answers` | One row per player per question: selected option, server timestamp, server-computed `is_correct` and `points`. |

Integrity is enforced by the database, not just by application code:

- `games.pin` is unique and must match `^[0-9]{6}$`.
- `players (game_id, nickname_key)` is unique → case/accent/punctuation-insensitive duplicate nicknames are impossible.
- `answers (player_id, question_index)` is unique → **one answer per player per question**, even under simultaneous requests.
- Check constraints: valid status values, `points` between 0 and 1000, no points for a wrong answer, a running question must have a deadline, nickname length, option count, time-limit range, hash formats.
- Foreign keys with `on delete cascade` (deleting a game removes its players and answers).

**Row Level Security** is enabled on every table with **no policies**, and all privileges are revoked
from Supabase's `anon` and `authenticated` roles. Someone holding only the public anon key can read
and write nothing — in particular not `question_keys`. The server connects as the database owner.
This is tested (`tests/db/schema.test.ts`) by switching to the `anon`/`authenticated` roles.

## 6. Environment variables

See [`.env.example`](.env.example) for the annotated list.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | production | Supabase Postgres connection string (server-only). Absent → local demo mode (dev) / "backend not configured" (production). |
| `DATABASE_CA_CERT` / `DATABASE_SSL_NO_VERIFY` / `DATABASE_SSL` | recommended | TLS settings, see §4. |
| `DATABASE_POOL_MAX` | no | Connections per instance (default 5). |
| `HOST_ACCESS_CODE` | recommended | If set, creating a game requires this code. |
| `NICKNAME_BLOCKLIST` | no | Extra blocked nickname terms, comma-separated. |
| `NEXT_PUBLIC_APP_URL` | no | Base URL used in the QR code (public, not secret). |
| `ALLOW_MEMORY_STORE` | demo only | Permits the in-memory store in a production build. Never on Vercel. |
| `TEST_DATABASE_URL` | tests | Admin connection for database tests. |

Nothing here is a privileged key that is sent to the browser. The only `NEXT_PUBLIC_` variable is a URL.

## 7. Authentication and authorization

There are no user accounts. Authority comes from two unguessable secrets, each stored **hashed**
(SHA-256) in the database and held by the browser in an **httpOnly, SameSite=Lax** cookie
(`Secure` on HTTPS):

- **Host secret** — issued when a game is created. Every host action (start, pause, resume, reveal,
  advance, end) and the host's state view require it. Students cannot obtain it.
- **Player secret** — issued when a player joins. Required to read player state and submit answers.
  It also *is* the reconnection mechanism: refreshing the page or losing the connection keeps the same
  player, answer and score; the same browser re-joining returns the same player instead of creating a duplicate.

Optional extra protection: `HOST_ACCESS_CODE` gates game creation, so only people who know the code
can create sessions on a public deployment.

All authorization is checked on the server for every request; the UI hiding a button is never relied on.
Every state-changing host request carries the `expectedVersion` the screen was showing; if the game
has moved on (double click, stale screen) the server applies nothing and the screen re-syncs.

## 8. Real-time design

Each client polls its role-specific state endpoint (`GET /api/games/{pin}/state`) about once per
second (1.5 s in the lobby, 4 s when the tab is hidden, exponential back-off to 5 s on errors).

Why polling and not WebSockets/Supabase Realtime? Serverless functions cannot hold connections or
timers, direct browser access to the database would require exposing tables (and the answer key) through
RLS policies, and polling degrades gracefully on poor networks — relevant for a talk about digital
inequality. The cost: updates arrive within ~1 s rather than instantly. For ~40 phones that is ~40 small
requests per second against a pooled connection, which is comfortable for a Supabase free-tier project
(not load-tested here).

Consistency rules:

- **The server owns time.** `opensAt`/`closesAt` are server timestamps; each response includes the
  server clock so the browser countdown follows the server's clock, not the device's. The countdown is
  display-only; the server enforces the deadline.
- **Timers without background jobs.** A question whose deadline has passed is finalised lazily by the
  first request that notices (compare-and-set on `games.version`, so concurrent requests are safe).
- **Out-of-order responses are discarded** by the client (by `version`/`serverTime`).
- **Transactions & locks** (PostgreSQL): joins lock the game row `FOR UPDATE` (serialised with "start");
  answers take `FOR SHARE` (parallel with each other, serialised with the reveal); the reveal takes
  `FOR UPDATE` and recomputes every score from the stored answers. An answer is therefore either counted
  in the reveal or rejected as late — never lost, never double-counted.

## 9. Running tests

```bash
npm run lint
npm run typecheck
npm run test:unit        # domain logic, in-memory store contract, full service flow (no database needed)

scripts/local-postgres.sh start
export TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres
npm run test:db          # same contracts + schema constraints + RLS against real PostgreSQL

npm run build
PW_CHROMIUM_PATH=/path/to/chromium npm run test:e2e   # omit PW_CHROMIUM_PATH if `npx playwright install chromium` was run
```

Without `TEST_DATABASE_URL` the database tests are reported as *skipped*, not passed.

Browser tests run against a production build. To run them against PostgreSQL instead of the in-memory
store: `E2E_DATABASE_URL=postgres://… npm run db:migrate && E2E_DATABASE_URL=… npm run test:e2e`.

What is covered: PIN generation and collision handling; nickname validation (length, markup, reserved,
abusive, duplicates, Unicode); quiz validation, option shuffling and correctness; scoring (correct, wrong,
late, grace window, speed bonus bounds); leaderboard sorting, ties, podium with fewer than three players;
the game state machine; host authorization; answer secrecy (the key never appears in any pre-reveal
response); duplicate/concurrent answers; answer-versus-deadline races; pause/resume; reconnection;
database constraints; RLS for `anon`/`authenticated`; a full 7-question browser game with a host and
three phones; layout at three projector and three phone sizes; keyboard-only play; axe-core audits of every screen.

## 10. Production build

```bash
npm run build
npm start         # needs DATABASE_URL (or ALLOW_MEMORY_STORE=true for a local demo)
```

## 11. Deploying to Vercel

1. Push the repository to GitHub and *Import Project* in Vercel (framework preset: Next.js; no build overrides).
2. Add environment variables (Production): `DATABASE_URL` (Supabase **transaction pooler** string),
   `DATABASE_CA_CERT` (or `DATABASE_SSL_NO_VERIFY=true`), `HOST_ACCESS_CODE`, `NEXT_PUBLIC_APP_URL`
   (your production URL), optionally `NICKNAME_BLOCKLIST`.
3. Deploy, then open `/api/health` — it must report `"mode":"postgres"`.
4. Open `/host`, create a game, and join from a phone **before** the day of the presentation.

No Vercel-specific code is required. Select a Vercel region close to your Supabase region to keep
query latency low.

## 12. Running a classroom game

**Before class (5 minutes):** deploy, open `/api/health`, create a test game, join with your phone, play
one question, then end the game. Check the projector shows the full screen without scrolling (press F11
for full-screen in the browser).

**During the presentation:**

1. On the laptop connected to the projector open `/host`, choose the time per question (default 20 s)
   and **Create game**. Enter the access code if you set one.
2. The lobby shows the **PIN**, a **QR code** and the join address. Students scan the code (or open the
   address and type the PIN), choose a nickname and appear on the screen.
3. Click **Start game** when everyone is in. The lobby closes: nobody can join after the start.
4. For each question: read it aloud, wait for the timer (or for everyone to answer — the question
   closes automatically), or click **Reveal answer**. Use **Pause** if the room needs a moment.
5. After the reveal, discuss the explanation, then **Show leaderboard** → **Next question**.
6. After question 7 click **Show final podium**. **Play again** creates a fresh game with a new PIN.

If the host's browser tab is refreshed or closed and reopened in the same browser, control is
preserved (the host cookie lasts for the game's lifetime).

## 13. Game rules, scoring and policies

**Scoring** (computed only on the server):

```
points = round(1000 × (0.8 + 0.2 × remaining_time / time_limit))      correct answer
points = 0                                                            wrong or missing answer
```

`remaining_time` is clamped to `[0, time_limit]`, so a correct answer is worth **800–1000**; speed can
change the result by at most 200 points and a wrong answer can never beat a correct one.
Scores are cumulative. Per-question points are stored with each answer; the player's total is recomputed
from those rows when the question is revealed.

**Ranking & ties:** higher total ranks higher; equal totals **share a rank** (1, 2, 2, 4). Speed is never
used as a tie-breaker (so network latency cannot decide a placing). Display order inside a tie is
alphabetical by normalised nickname and implies nothing. The podium reserves steps for players who scored
points: co-winners share a step, a missing step is skipped, fewer than three players works, and if nobody
scored the podium says so.

**Policies for edge cases**

| Situation | Policy |
| --- | --- |
| Join after the game started | Refused with an explanation. The lobby closes at **Start game**. |
| Duplicate nickname | Refused. Uniqueness ignores case, accents, spaces and punctuation (`Ali_B` = `ali b`) and common Cyrillic look-alikes. |
| Nickname rules | 2–16 characters; letters, digits, space and `. _ - ' ’ ʻ ʼ`; no markup. Reserved names (host, teacher, admin…) and an abusive-word list (extendable) are refused. |
| Answer after submitting | **First answer is final**; further attempts are rejected (`ALREADY_ANSWERED`). |
| Answer during the "grace window" | Answers are accepted for **600 ms after the displayed deadline** so slow connections do not lose an answer sent in time. They score as the minimum correct answer (800). |
| Answer after that | Rejected: "Time's up". |
| Everyone answered | The question closes immediately. |
| Host double-click | Each host request carries the version it saw; only the first applies. |
| Pause | Answers are refused while paused; resuming gives back the exact remaining time. |
| Page refresh / reconnect | Same browser keeps the same player, answer and score. The screen shows a reconnecting banner during outages. |
| Lost cookie (private mode, cleared data) | The nickname stays taken; the student must pick another nickname **in the lobby**. After the start they cannot rejoin. |
| Expired session | Games expire 6 hours after creation; every endpoint then reports "expired", and expired games are cleaned up. |
| Host ends the game early | Everyone gets the final podium with the scores so far. |

## 14. Editing the questions

All quiz content lives in [`src/content/default-quiz.ts`](src/content/default-quiz.ts). Edit the text, the
options (2–4), the correct letter, the explanation and optional `timeLimitSec`. Content is validated with Zod
at import time, so a malformed edit fails `npm run build`/tests instead of failing in class. Correctness is
by option id, so **Shuffle answer order** (host setting) never breaks scoring. To add another quiz, define
a second `AuthoredQuiz` and register it in `quizzes`; the host UI currently offers the default quiz only.

**Content policy — verify before adding.** The default quiz deliberately contains no statistics and no
unhedged statements of law. Any figure (e.g. the share of people offline), date or legal conclusion
(e.g. that internet access is a human right under a specific instrument) must be traced to a source and
cited by the presenters before it is added. Question 3's explanation is intentionally hedged ("depends on
the relevant circumstances and obligations"); keep it that way unless a source is verified.

## 15. Architecture

```
src/
  app/                  routes: /, /join, /host, /host/[pin], /play/[pin], /api/**
  components/           UI (ui/, host/ projector screens, player/ phone screens, forms/)
  content/              question bank (single source of quiz content)
  lib/domain/           pure logic, no I/O: scoring, ranking, nickname, pin, game-machine, quiz, schemas, view types
  lib/server/           game-service (business rules), stores (memory, postgres), tokens, rate limiter, view builder
  lib/client/           typed API client, polling hook, server-synchronised clock
supabase/migrations/    SQL schema, constraints, RLS
tests/                  unit/, db/, shared/ (contracts run against both stores), e2e/
```

Key decisions:

- **Pure domain + thin stores.** Rules (who may do what, deadlines, scoring) live in `game-service` and
  `domain/`. Stores only guarantee atomic consistency. One contract test-suite runs against both the memory
  and the PostgreSQL store, so the demo mode cannot drift from production behaviour.
- **View-models by whitelist.** Clients only ever receive `GameView` built field by field in
  `lib/server/view.ts`. The answer key and explanation are attached only in the reveal phase; a test
  asserts they are absent from every pre-reveal response for host and players.
- **Direct Postgres, not the Supabase client.** The server holds one database connection secret; the
  browser holds none. This removes the need for any client-facing key or RLS read policy.
- **Rate limiting is best-effort** (per-instance memory). Hard guarantees come from database constraints.

## 16. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Red banner "Backend not configured" | `DATABASE_URL` is not set in the deployment. Add it and redeploy. |
| Yellow banner "Demo mode" | No `DATABASE_URL`: in-memory demo mode. Fine locally, wrong for class. |
| `self-signed certificate in certificate chain` | Provide `DATABASE_CA_CERT`, or (trade-off) `DATABASE_SSL_NO_VERIFY=true`. |
| `relation "games" does not exist` | The migration has not been applied (§4 step 2). |
| `too many connections` / timeouts on Vercel | Use the **transaction pooler** string (port 6543) and keep `DATABASE_POOL_MAX` small. |
| Phones cannot open the QR code link | The lobby warns when it points to `localhost`. Open the host page via the laptop's network address or set `NEXT_PUBLIC_APP_URL`. |
| "That PIN doesn't match any game" | Typo, or the game expired (6 h) or was created on another deployment. |
| Student sees "You haven't joined this game" | Their cookie is gone (different browser / private tab). They must join again in the lobby with a new nickname. |
| Host sees "This browser isn't the host" | The game was created in another browser/profile. Create a new game here. |
| Everyone sees "Connection lost — reconnecting" | Network/server outage; screens recover automatically and no answers or scores are lost. |
| Database tests are "skipped" | `TEST_DATABASE_URL` is not set (§9). |
| Playwright cannot find a browser | `npx playwright install chromium`, or set `PW_CHROMIUM_PATH`. |

## 17. Known limitations

- **Not verified against a live Supabase project** (no credentials were available). Verified instead on
  PostgreSQL 16 locally, including concurrency. The Supabase-specific unknowns are TLS configuration for the
  pooler and your project's connection limits.
- **Polling, not push**: ~1 s update latency and constant light request load. No load test beyond tens of
  simulated players was run.
- **Per-instance rate limiting** on serverless; determined abuse is bounded by database constraints, a player
  cap of 150 per game and the optional host access code, not eliminated.
- **The nickname filter is basic** (small English list + your additions; Cyrillic/Latin look-alike
  handling is limited). The host sees every nickname on screen before starting.
- **A student who loses their cookie cannot reclaim their player** (by design: no accounts, no personal data).
- **Host authority is a browser secret**, not a user account. Anyone who obtains the host cookie controls the game.
- **Only the default quiz is selectable** in the UI; the data model and content format support custom quizzes.
- **Answer changes are not supported** (first answer is final).
- **No analytics, persistence of results, or export** — a game's data is deleted a day after it expires.
- Accessibility was checked with axe-core (WCAG 2.1 A/AA rules), keyboard-only play and contrast calculations;
  it has **not** been tested with a real screen reader.
