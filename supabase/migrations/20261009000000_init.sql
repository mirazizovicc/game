-- Digital Divide Challenge — initial schema.
--
-- Access model (important):
--   * The browser NEVER talks to the database. All reads/writes go through the
--     Next.js server (route handlers), which connects with a server-only
--     DATABASE_URL (the `postgres` role / pooler connection string).
--   * Row Level Security is ENABLED on every table with NO policies, and all
--     privileges are revoked from Supabase's `anon` and `authenticated` roles.
--     Result: someone holding only the public anon key can read nothing —
--     in particular not `question_keys` (the answer key) or `players.token_hash`.
--   * Supabase's `postgres`/`service_role` roles bypass RLS, which is what the
--     server uses.

create table if not exists quizzes (
  id          text primary key,
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  created_at  timestamptz not null default now()
);

-- Immutable, content-hashed quiz content (editing a quiz creates a new quiz id).
create table if not exists questions (
  id             text primary key,
  quiz_id        text not null references quizzes (id) on delete cascade,
  position       smallint not null check (position >= 0),
  prompt         text not null check (char_length(prompt) between 1 and 300),
  -- [{"id":"a","text":"..."}, ...] — no correctness information in here.
  options        jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  time_limit_sec smallint not null check (time_limit_sec between 5 and 120),
  unique (quiz_id, position)
);

-- The answer key lives in its own table so that no query on `questions`
-- (public-facing in a future version) can ever leak it.
create table if not exists question_keys (
  question_id       text primary key references questions (id) on delete cascade,
  correct_option_id text not null check (char_length(correct_option_id) between 1 and 16),
  explanation       text not null check (char_length(explanation) between 1 and 600)
);

create table if not exists games (
  id               uuid primary key,
  pin              text not null unique check (pin ~ '^[0-9]{6}$'),
  quiz_id          text not null references quizzes (id),
  title            text not null check (char_length(title) between 1 and 120),
  status           text not null default 'lobby'
                     check (status in ('lobby', 'question', 'reveal', 'leaderboard', 'finished')),
  question_index   smallint not null default -1 check (question_index >= -1),
  -- Bumped by every transition; all state changes are compare-and-set on it.
  version          integer not null default 0 check (version >= 0),
  opens_at         timestamptz,
  closes_at        timestamptz,
  paused_at        timestamptz,
  config           jsonb not null default '{}'::jsonb,
  option_seed      text not null,
  -- SHA-256 of the host secret (never the secret itself).
  host_token_hash  text not null check (host_token_hash ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  check (expires_at > created_at),
  check (status <> 'question' or (opens_at is not null and closes_at is not null and closes_at > opens_at))
);
create index if not exists games_expires_at_idx on games (expires_at);

create table if not exists players (
  id           uuid primary key,
  game_id      uuid not null references games (id) on delete cascade,
  nickname     text not null check (char_length(nickname) between 2 and 16),
  -- Normalised nickname: case-, accent- and punctuation-insensitive identity.
  nickname_key text not null check (char_length(nickname_key) >= 2),
  score        integer not null default 0 check (score >= 0),
  token_hash   text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- No two players in a game may share a nickname (case-insensitive policy).
  unique (game_id, nickname_key)
);

create table if not exists answers (
  id                 uuid primary key,
  game_id            uuid not null references games (id) on delete cascade,
  player_id          uuid not null references players (id) on delete cascade,
  question_id        text not null references questions (id),
  question_index     smallint not null check (question_index >= 0),
  selected_option_id text not null check (char_length(selected_option_id) between 1 and 16),
  -- Stamped by the server, never accepted from the client.
  submitted_at       timestamptz not null,
  -- Computed by the server from the answer key and the server-side deadline.
  is_correct         boolean not null,
  points             integer not null check (points between 0 and 1000),
  check (is_correct or points = 0),
  -- One answer per player per question, enforced by the database.
  unique (player_id, question_index)
);
create index if not exists answers_game_question_idx on answers (game_id, question_index);

-- Deny-by-default for everything except the server connection.
alter table quizzes       enable row level security;
alter table questions     enable row level security;
alter table question_keys enable row level security;
alter table games         enable row level security;
alter table players       enable row level security;
alter table answers       enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table quizzes, questions, question_keys, games, players, answers from %I', role_name);
    end if;
  end loop;
end
$$;
