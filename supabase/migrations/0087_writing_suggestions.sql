-- 1.23.0: writing suggestions in the script editor (spelling, grammar and
-- style, like Grammarly). The checks themselves run in the browser and at
-- LanguageTool; the only thing kept here is the team's dictionary: words the
-- spelling check should accept (names, the channel's own words, slang).
--
-- Everyone on the team reads it and adds to it. A word is removed by whoever
-- added it, or by a master. Who added a word is stamped by the database.
-- Additive only: a new table, nothing else changes.

create table if not exists team_dictionary (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  word text not null,
  added_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint team_dictionary_word_ok check (char_length(word) between 1 and 48 and word = btrim(word) and word !~ '\s')
);
-- One of each word per team, whatever the capitals.
create unique index if not exists team_dictionary_word_key on team_dictionary (team_id, lower(word));

-- A dictionary, not a dumping ground: 5,000 words per team.
create or replace function team_dictionary_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from team_dictionary where team_id = new.team_id) >= 5000 then
    raise exception 'The team''s dictionary is full (5,000 words).' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists team_dictionary_limit on team_dictionary;
create trigger team_dictionary_limit before insert on team_dictionary
  for each row execute procedure team_dictionary_limit();

alter table team_dictionary enable row level security;
revoke all on team_dictionary from anon;
revoke insert, update on team_dictionary from authenticated;
grant select, delete on team_dictionary to authenticated;
grant insert (id, team_id, word) on team_dictionary to authenticated;

drop policy if exists "teammates read the dictionary" on team_dictionary;
create policy "teammates read the dictionary" on team_dictionary for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "teammates add words" on team_dictionary;
create policy "teammates add words" on team_dictionary for insert to authenticated
  with check (team_id in (select my_team_ids()) and added_by = auth.uid());
drop policy if exists "who added it or a master removes it" on team_dictionary;
create policy "who added it or a master removes it" on team_dictionary for delete to authenticated
  using (team_id in (select my_team_ids()) and (added_by = auth.uid() or team_id in (select my_master_team_ids())));
