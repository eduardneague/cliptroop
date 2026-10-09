-- ============================================================================
-- 0077: the daily word (1.13.0)
--
--   * daily_word_plays: one row per person per day: the puzzle's number, the
--     guesses so far (at most 6), solved, finished. Finishing it (solved or
--     out of tries) counts as a contribution that day.
--   * People read only their own plays (their guesses would give the word
--     away). Only the server writes them, after checking each guess against
--     the day's word, so nobody can mark a game solved by hand.
--   * daily_word_team(): a day's results of a team you're in: how many tries
--     and solved or not, never the letters.
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

create table if not exists daily_word_plays (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  puzzle int not null,
  guesses text[] not null default '{}',
  solved boolean not null default false,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint daily_word_plays_tries check (cardinality(guesses) <= 6),
  constraint daily_word_plays_finished check (finished_at is not null or not solved)
);
create index if not exists daily_word_plays_day_idx on daily_word_plays (day);
create index if not exists daily_word_plays_user_finished_idx on daily_word_plays (user_id, finished_at desc) where finished_at is not null;

alter table daily_word_plays enable row level security;
revoke all on daily_word_plays from anon, authenticated;
grant select on daily_word_plays to authenticated;
drop policy if exists "your own words" on daily_word_plays;
create policy "your own words" on daily_word_plays for select to authenticated using (user_id = auth.uid());

create or replace function daily_word_team(p_team uuid, p_day date)
returns table (user_id uuid, tries int, solved boolean, finished boolean)
language sql
stable
security definer set search_path = public
as $$
  select p.user_id, cardinality(p.guesses), p.solved, p.finished_at is not null
  from daily_word_plays p
  where p.day = p_day
    and p_team in (select my_team_ids())
    and p.user_id in (select m.user_id from team_members m where m.team_id = p_team and m.status = 'active');
$$;
revoke all on function daily_word_team(uuid, date) from public, anon;
grant execute on function daily_word_team(uuid, date) to authenticated;
