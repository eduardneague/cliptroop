-- Checks for 0090: the search bar finds scripts, meetings, action items,
-- objectives and projections, long videos by their notes and shorts by their
-- caption; only ever your own teams' (and money projections only for the
-- people who see revenue). Run by scripts/db/test-from-scratch.sh; each
-- check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team S (its owner), E = editor in team S, O = master of team T.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000005a1', 'ms@example.com'),
  ('00000000-0000-4000-8000-0000000005a2', 'es@example.com'),
  ('00000000-0000-4000-8000-0000000005b1', 'ot@example.com')
on conflict do nothing;
insert into profiles (id, email, username) values
  ('00000000-0000-4000-8000-0000000005a1', 'ms@example.com', 'searchmaster'),
  ('00000000-0000-4000-8000-0000000005a2', 'es@example.com', 'searcheditor'),
  ('00000000-0000-4000-8000-0000000005b1', 'ot@example.com', 'othermaster')
on conflict (id) do update set username = excluded.username;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000005a0', 'Team S', 'search-s', '00000000-0000-4000-8000-0000000005a1'),
  ('10000000-0000-4000-8000-0000000005b0', 'Team T', 'search-t', '00000000-0000-4000-8000-0000000005b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000005a2', '10000000-0000-4000-8000-0000000005a0', '00000000-0000-4000-8000-0000000005a2', 'es@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-0000000005a2', 'editor')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Team S: a long video with a script and a research document, a short with a
-- caption, a meeting with an action item, an objective and two projections.
-- Team T: the same words in its own script, meeting and objective.
insert into long_video_projects (id, team_id, title, stage, created_by, description, hook) values
  ('30000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a0', 'Fake iPhones are getting scary good', 'script', '00000000-0000-4000-8000-0000000005a1',
   'We bought twelve counterfeit phones from three markets and tested every one.', 'Can you tell which one is real?'),
  ('30000000-0000-4000-8000-0000000005b1', '10000000-0000-4000-8000-0000000005b0', 'Team T video', 'script', '00000000-0000-4000-8000-0000000005b1', null, null);
insert into short_videos (id, team_id, title, created_by, caption) values
  ('50000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a0', 'Street food in Osaka', '00000000-0000-4000-8000-0000000005a1',
   'Takoyaki at midnight, the best snack in Dotonbori. Link in bio!');
insert into scripts (id, long_video_id, kind, name, content_text) values
  ('70000000-0000-4000-8000-0000000005a1', '30000000-0000-4000-8000-0000000005a1', 'script', 'Script',
   E'Intro\nThe phones arrived on a Tuesday. We opened the boxes one by one and the first thing we noticed was the weight. The sponsor deck goes here, right after the unboxing, before the teardown starts.\nOutro'),
  ('70000000-0000-4000-8000-0000000005a2', '30000000-0000-4000-8000-0000000005a1', 'research', 'Research',
   'Counterfeit markets: Shenzhen, Lagos and Bangkok. Prices from 40 to 120 dollars.'),
  ('70000000-0000-4000-8000-0000000005b1', '30000000-0000-4000-8000-0000000005b1', 'script', 'Script',
   'Team T also mentions the sponsor deck, but only Team T may find it.');
insert into meetings (id, team_id, title, starts_at, agenda, notes) values
  ('80000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a0', 'Monthly planning', now() + interval '2 days',
   'Look at the numbers. Decide the October sponsor slots.', 'Mara takes the thumbnail tests.'),
  ('80000000-0000-4000-8000-0000000005b1', '10000000-0000-4000-8000-0000000005b0', 'Team T planning', now() + interval '1 day', 'Sponsor slots for Team T.', '');
insert into meeting_actions (id, meeting_id, team_id, text, owner_id) values
  ('90000000-0000-4000-8000-0000000005a1', '80000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a0', 'Send the sponsor deck to Nord', '00000000-0000-4000-8000-0000000005a2');
insert into objectives (id, team_id, title, metric, period, target, color) values
  ('a0000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a0', 'Shorts every day', 'shorts_posted', 'week', 7, 'blue'),
  ('a0000000-0000-4000-8000-0000000005b1', '10000000-0000-4000-8000-0000000005b0', 'Shorts every day in Team T', 'shorts_posted', 'week', 7, 'blue');
insert into projections (id, team_id, title, metric, target, start_day, deadline, color) values
  ('b0000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a0', 'Subscriber milestone', 'followers', 100000, current_date, current_date + 90, 'blue'),
  ('b0000000-0000-4000-8000-0000000005a2', '10000000-0000-4000-8000-0000000005a0', 'Revenue milestone', 'revenue', 5000, current_date, current_date + 90, 'green');

-- 1. The words around a match: whole words, one line, "…" where it was cut.
do $$ declare s text; begin
  s := search_snippet(repeat('alpha ', 40) || E'the sponsor\n\ndeck goes here ' || repeat('omega ', 40), 241);
  if s not like '… %' or s not like '% …' then
    raise exception 'FAIL 1: a match in the middle should be cut on both sides (got %)', s;
  end if;
  if position(E'\n' in s) > 0 or s like '%  %' then
    raise exception 'FAIL 1: the snippet should be on one line (got %)', s;
  end if;
  if s not like '%the sponsor deck goes here%' then
    raise exception 'FAIL 1: the match should be in the snippet (got %)', s;
  end if;
  if s not like '… alpha %' or s not like '% omega …' then
    raise exception 'FAIL 1: the snippet should start and end on whole words (got %)', s;
  end if;
  if search_snippet('Short and sweet.', 7) <> 'Short and sweet.' then
    raise exception 'FAIL 1: a short text should come back whole (got %)', search_snippet('Short and sweet.', 7);
  end if;
  if search_snippet('', 1) is not null or search_snippet(null, 1) is not null then
    raise exception 'FAIL 1: nothing to show should be null';
  end if;
end $$;

-- 2. The editor finds the script by the words in a row, with the sentence
--    around them, which video it's for, and never Team T's.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005a2');
  set local role authenticated;
  do $$ declare r jsonb; d jsonb; begin
    r := global_search('sponsor deck', 6);
    if jsonb_array_length(r->'scripts') <> 1 then
      raise exception 'FAIL 2: one script of Team S should be found (got %)', r->'scripts';
    end if;
    d := r->'scripts'->0;
    if d->>'id' <> '70000000-0000-4000-8000-0000000005a1' or d->>'video_kind' <> 'long'
       or d->>'video_id' <> '30000000-0000-4000-8000-0000000005a1' or d->>'video_title' <> 'Fake iPhones are getting scary good'
       or (d->>'entry_number') is null or d->>'kind' <> 'script' or d->'team'->>'name' <> 'Team S' then
      raise exception 'FAIL 2: the script should say which video it is for (got %)', d;
    end if;
    if d->>'snippet' not like '%sponsor deck goes here%' then
      raise exception 'FAIL 2: the snippet should show the match (got %)', d->>'snippet';
    end if;
    -- Every word somewhere, not in a row: still found, below a match in a row.
    r := global_search('teardown phones', 6);
    if jsonb_array_length(r->'scripts') <> 1 or r->'scripts'->0->>'id' <> '70000000-0000-4000-8000-0000000005a1' then
      raise exception 'FAIL 2: a script with every word should be found (got %)', r->'scripts';
    end if;
    -- Research documents too.
    r := global_search('shenzhen', 6);
    if r->'scripts'->0->>'kind' is distinct from 'research' then
      raise exception 'FAIL 2: research should be found (got %)', r->'scripts';
    end if;
    -- Two letters: not inside documents.
    r := global_search('de', 6);
    if jsonb_array_length(r->'scripts') <> 0 or jsonb_array_length(r->'meetings') <> 0 then
      raise exception 'FAIL 2: two letters shouldn''t look inside documents (got %)', r->'scripts';
    end if;
  end $$;
rollback;

-- 3. Meetings by title, agenda or notes; action items with their meeting.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005a2');
  set local role authenticated;
  do $$ declare r jsonb; m jsonb; a jsonb; begin
    r := global_search('monthly', 6);
    m := r->'meetings'->0;
    if m->>'id' is distinct from '80000000-0000-4000-8000-0000000005a1' or m->>'matched_field' is not null then
      raise exception 'FAIL 3: the meeting should be found by its title (got %)', r->'meetings';
    end if;
    r := global_search('sponsor slots', 6);
    if jsonb_array_length(r->'meetings') <> 1 or r->'meetings'->0->>'matched_field' <> 'agenda'
       or r->'meetings'->0->>'matched_text' not like '%October sponsor slots%' then
      raise exception 'FAIL 3: the agenda should be searched, only Team S''s (got %)', r->'meetings';
    end if;
    r := global_search('thumbnail tests', 6);
    if r->'meetings'->0->>'matched_field' is distinct from 'notes' then
      raise exception 'FAIL 3: the notes should be searched (got %)', r->'meetings';
    end if;
    r := global_search('sponsor deck', 6);
    a := r->'actions'->0;
    if jsonb_array_length(r->'actions') <> 1 or a->>'meeting_title' <> 'Monthly planning' or not (a->>'mine')::boolean
       or (a->>'done')::boolean or a->>'owner_name' <> 'searcheditor' then
      raise exception 'FAIL 3: the action item should be found, marked as mine (got %)', r->'actions';
    end if;
  end $$;
rollback;

-- 4. Objectives and projections: your teams' only; money ones only for the
--    people who see revenue (the master, not the editor).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005a2');
  set local role authenticated;
  do $$ declare r jsonb; begin
    r := global_search('shorts every', 6);
    if jsonb_array_length(r->'objectives') <> 1 or r->'objectives'->0->>'id' <> 'a0000000-0000-4000-8000-0000000005a1' then
      raise exception 'FAIL 4: only Team S''s objective should be found (got %)', r->'objectives';
    end if;
    r := global_search('milestone', 6);
    if jsonb_array_length(r->'projections') <> 1 or r->'projections'->0->>'title' <> 'Subscriber milestone' then
      raise exception 'FAIL 4: the editor shouldn''t find the money projection (got %)', r->'projections';
    end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005a1');
  set local role authenticated;
  do $$ declare r jsonb; begin
    r := global_search('milestone', 6);
    if jsonb_array_length(r->'projections') <> 2 then
      raise exception 'FAIL 4: the master should find both projections (got %)', r->'projections';
    end if;
  end $$;
rollback;

-- 5. Long videos by their description, shorts by their caption; titles first.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005a2');
  set local role authenticated;
  do $$ declare r jsonb; p jsonb; s jsonb; begin
    r := global_search('counterfeit phones', 6);
    p := r->'projects'->0;
    if p->>'id' is distinct from '30000000-0000-4000-8000-0000000005a1' or p->>'matched_field' <> 'description'
       or p->>'matched_text' not like '%counterfeit phones%' then
      raise exception 'FAIL 5: the long video should be found by its description (got %)', r->'projects';
    end if;
    r := global_search('takoyaki', 6);
    s := r->'shorts'->0;
    if s->>'id' is distinct from '50000000-0000-4000-8000-0000000005a1' or s->>'matched_field' <> 'caption'
       or s->>'matched_text' not like '%Takoyaki at midnight%' then
      raise exception 'FAIL 5: the short should be found by its caption (got %)', r->'shorts';
    end if;
    r := global_search('street food', 6);
    if r->'shorts'->0->>'matched_field' is not null then
      raise exception 'FAIL 5: a title match shouldn''t say caption (got %)', r->'shorts';
    end if;
    -- Every list says how good the match is.
    if (r->'shorts'->0->>'score') is null then
      raise exception 'FAIL 5: results should carry their score (got %)', r->'shorts';
    end if;
  end $$;
rollback;

-- 6. A number looks up videos only, and the answer keeps every list.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005a2');
  set local role authenticated;
  do $$ declare r jsonb; n int; begin
    select entry_number into n from short_videos where id = '50000000-0000-4000-8000-0000000005a1';
    r := global_search('#' || n, 6);
    if not exists (select 1 from jsonb_array_elements(r->'shorts') x where x->>'id' = '50000000-0000-4000-8000-0000000005a1') then
      raise exception 'FAIL 6: #% should find the short (got %)', n, r->'shorts';
    end if;
    if jsonb_array_length(r->'scripts') + jsonb_array_length(r->'meetings') + jsonb_array_length(r->'people') <> 0 then
      raise exception 'FAIL 6: a number shouldn''t look anywhere else (got %)', r;
    end if;
    if not (r ? 'actions' and r ? 'objectives' and r ? 'projections' and r ? 'master_teams' and r ? 'teams') then
      raise exception 'FAIL 6: every list should be in the answer (got %)', r;
    end if;
    r := global_search('x', 6);
    if not (r ? 'scripts' and r ? 'meetings') then
      raise exception 'FAIL 6: a short query should still answer every list (got %)', r;
    end if;
  end $$;
rollback;

-- 7. Someone in another team finds only their own.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005b1');
  set local role authenticated;
  do $$ declare r jsonb; begin
    r := global_search('sponsor deck', 6);
    if jsonb_array_length(r->'scripts') <> 1 or r->'scripts'->0->>'id' <> '70000000-0000-4000-8000-0000000005b1'
       or jsonb_array_length(r->'actions') <> 0 then
      raise exception 'FAIL 7: Team T should only find its own (got %)', r;
    end if;
    r := global_search('counterfeit', 6);
    if jsonb_array_length(r->'projects') <> 0 or jsonb_array_length(r->'scripts') <> 0 then
      raise exception 'FAIL 7: Team S''s video and research shouldn''t be found (got %)', r;
    end if;
  end $$;
rollback;

-- 8. The scripts part (search_docs, SECURITY DEFINER so the index works):
--    nobody signed in gets nothing, anon can't call it, and it keeps to
--    your teams by itself.
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  if jsonb_array_length(search_docs('sponsor deck', 6)) <> 0 then
    raise exception 'FAIL 8: without a signed-in person, search_docs should find nothing';
  end if;
end $$;
begin;
  set local role anon;
  do $$ begin
    perform search_docs('sponsor deck', 6);
    raise exception 'FAIL 8: anon should not be able to call search_docs';
  exception when insufficient_privilege then null;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000005b1');
  set local role authenticated;
  do $$ declare r jsonb; begin
    r := search_docs('sponsor deck', 20);
    if exists (select 1 from jsonb_array_elements(r) x where x->'team'->>'id' <> '10000000-0000-4000-8000-0000000005b0') then
      raise exception 'FAIL 8: search_docs should only return the caller''s teams (got %)', r;
    end if;
    r := search_docs('teardown phones', 20);
    if jsonb_array_length(r) <> 0 then
      raise exception 'FAIL 8: Team S''s script shouldn''t be found by Team T (got %)', r;
    end if;
  end $$;
rollback;
