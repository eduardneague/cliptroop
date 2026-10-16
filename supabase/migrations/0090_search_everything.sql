-- ============================================================================
-- 0090: the search bar finds everything (1.26.0)
--
--   * global_search(q) keeps its answer (people, projects, shorts, teams,
--     master_teams) and adds, for 3+ letters:
--       scripts       the words inside scripts and research documents, with
--                     the sentence around them (snippet)
--       meetings      by title, agenda or notes
--       actions       meeting action items
--       objectives    the team's goals, by title
--       projections   by title (money ones only for people who see revenue:
--                     the table's own rule, 0080)
--     Long videos also match their theme, hook, notes and description, and
--     shorts their caption (matched_field / matched_text).
--   * Every list keeps its "score", so the app can put the best one on top.
--   * search_snippet(text, pos): the words around a match, cut at words.
--   * search_docs(q, max): the scripts part. Row Level Security keeps a
--     filter from using an index unless it's "leakproof", and LIKE isn't, so
--     under RLS every search read every script in full. This one is SECURITY
--     DEFINER and applies the same rule itself (your teams' documents, as
--     "scripts readable by teammates", 0034), so the trigram index on the
--     text (0034) finds them.
--
-- SECURITY: still SECURITY INVOKER: it runs as the person searching, so Row
-- Level Security decides what can be found (your teams only; projections'
-- money rule). Emails are never returned.
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The words around a match
-- ---------------------------------------------------------------------------
-- From a little before `pos` (1-based) to about `width` characters later,
-- starting and ending on whole words, on one line, with "…" where it was cut.
create or replace function search_snippet(txt text, pos int, width int default 160)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s int;
  body text;
  sp int;
  more boolean;
begin
  if txt is null or btrim(txt) = '' then
    return null;
  end if;
  width := least(greatest(coalesce(width, 160), 40), 400);
  pos := least(greatest(coalesce(pos, 1), 1), length(txt));
  s := greatest(1, pos - width / 3);
  -- Start on a word: skip the one the cut landed in (never past the match).
  if s > 1 then
    sp := strpos(substr(txt, s, 30), ' ');
    if sp > 0 and s + sp <= pos then
      s := s + sp;
    end if;
  end if;
  body := substr(txt, s, width);
  more := s + width <= length(txt);
  -- End on a word too.
  if more then
    sp := strpos(reverse(body), ' ');
    if sp > 0 and length(body) - sp > width / 2 then
      body := left(body, length(body) - sp);
    end if;
  end if;
  body := btrim(regexp_replace(body, '\s+', ' ', 'g'));
  return (case when s > 1 then '… ' else '' end) || body || (case when more then ' …' else '' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Faster caption matches (shorts can be thousands)
-- ---------------------------------------------------------------------------
create index if not exists short_videos_caption_trgm_idx
  on short_videos using gin (lower(caption) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Words inside scripts and research
-- ---------------------------------------------------------------------------
-- Your teams' documents only (the same rule as the table's own policy), the
-- words in a row first (most recently changed first, the ones whose video's
-- title has them before), then documents that have every word somewhere.
-- The words around the match are worked out for the few that are returned.
create or replace function search_docs(q text, max_results int default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  term text := left(lower(trim(coalesce(q, ''))), 64);
  lim int := least(greatest(coalesce(max_results, 6), 1), 20);
  pat text;
  part_pats text[];
  strong text[];
  strong_pats text[];
  teams uuid[];
  found jsonb := '[]'::jsonb;
  more jsonb := '[]'::jsonb;
  n int := 0;
begin
  if auth.uid() is null or length(term) < 3 then
    return found;
  end if;
  select array_agg(t) into teams from my_team_ids() t;
  if teams is null then
    return found;
  end if;
  pat := '%' || search_escape_like(term) || '%';
  select array_agg('%' || search_escape_like(w) || '%') into part_pats
    from regexp_split_to_table(term, '\s+') w where length(w) >= 2;
  -- Words of 3+ letters, longest first: what the index can look for.
  select array_agg(w order by length(w) desc), array_agg('%' || search_escape_like(w) || '%' order by length(w) desc)
    into strong, strong_pats
    from regexp_split_to_table(term, '\s+') w where length(w) >= 3;

  -- The words in a row.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'kind', x.kind, 'name', x.name,
           'video_kind', case when x.short_video_id is not null then 'short' else 'long' end,
           'video_id', coalesce(x.short_video_id, x.long_video_id),
           'entry_number', x.entry_number, 'video_title', x.video_title,
           'team', jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url),
           'snippet', search_snippet(x.content_text, strpos(lower(x.content_text), term)),
           'score', 2 + case when x.title_hit then 0.3 else 0 end
         ) order by x.title_hit desc, x.updated_at desc), '[]'::jsonb),
         count(*)
    into found, n
    from (
      select d.id, d.kind, d.name, d.updated_at, d.short_video_id, d.long_video_id, d.team_id, d.content_text,
             coalesce(sv.entry_number, lp.entry_number) as entry_number,
             coalesce(sv.title, lp.title) as video_title,
             coalesce(lower(coalesce(sv.title, lp.title)) like pat, false) as title_hit
      from (
        -- At most 200 to sort: a very common word stops early instead of reading everything.
        select d.* from scripts d
        where d.team_id = any(teams)
          and lower(d.content_text) like pat
        limit 200
      ) d
      left join short_videos sv on sv.id = d.short_video_id
      left join long_video_projects lp on lp.id = d.long_video_id
      order by title_hit desc, d.updated_at desc
      limit lim
    ) x
    join teams t on t.id = x.team_id;

  -- Not enough: every word, anywhere in the document (the three longest find them).
  if n < lim and cardinality(part_pats) > 1 and strong_pats is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id, 'kind', x.kind, 'name', x.name,
             'video_kind', case when x.short_video_id is not null then 'short' else 'long' end,
             'video_id', coalesce(x.short_video_id, x.long_video_id),
             'entry_number', x.entry_number, 'video_title', x.video_title,
             'team', jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url),
             'snippet', search_snippet(x.content_text, strpos(lower(x.content_text), strong[1])),
             'score', 1
           ) order by x.updated_at desc), '[]'::jsonb)
      into more
      from (
        select d.id, d.kind, d.name, d.updated_at, d.short_video_id, d.long_video_id, d.team_id, d.content_text,
               coalesce(sv.entry_number, lp.entry_number) as entry_number,
               coalesce(sv.title, lp.title) as video_title
        from (
          select d.* from scripts d
          where d.team_id = any(teams)
            and lower(d.content_text) like strong_pats[1]
            and lower(d.content_text) like coalesce(strong_pats[2], strong_pats[1])
            and lower(d.content_text) like coalesce(strong_pats[3], strong_pats[1])
            and lower(d.content_text) like all (part_pats)
            and lower(d.content_text) not like pat
          limit 200
        ) d
        left join short_videos sv on sv.id = d.short_video_id
        left join long_video_projects lp on lp.id = d.long_video_id
        order by d.updated_at desc
        limit lim - n
      ) x
      join teams t on t.id = x.team_id;
  end if;
  return found || more;
end;
$$;

revoke all on function search_docs(text, int) from public, anon;
grant execute on function search_docs(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Search
-- ---------------------------------------------------------------------------
-- Supabase runs migrations as a role that isn't a superuser: a function's
-- "set pg_trgm.…" below is only accepted once pg_trgm is loaded in this
-- session (0089, section 7). One call of its own does that.
do $$
declare
  s text := (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm');
begin
  if s is not null then
    execute format('select %I.similarity(%L, %L)', s, 'a', 'a');
  end if;
end $$;

create or replace function global_search(q text, max_results int default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare
  term text := left(lower(trim(coalesce(q, ''))), 64);
  lim int := least(greatest(coalesce(max_results, 6), 1), 20);
  esc text;
  contains_pat text;
  prefix_pat text;
  num int;
  -- 3+ characters: also look inside scripts, notes, captions and descriptions.
  deep boolean;
  people jsonb := '[]'::jsonb;
  projects jsonb := '[]'::jsonb;
  shorts jsonb := '[]'::jsonb;
  teams_found jsonb := '[]'::jsonb;
  docs_found jsonb := '[]'::jsonb;
  meetings_found jsonb := '[]'::jsonb;
  actions_found jsonb := '[]'::jsonb;
  objectives_found jsonb := '[]'::jsonb;
  projections_found jsonb := '[]'::jsonb;
  master_teams jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url
         ) order by t.name), '[]'::jsonb)
    into master_teams
    from teams t
   where t.id in (select my_master_team_ids());
  -- "#12" or "12" → entry number lookup (shorts + long videos).
  if term ~ '^#?[0-9]{1,7}$' then
    num := ltrim(term, '#')::int;
  end if;
  if length(term) < 2 and num is null then
    return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                              'teams', teams_found, 'master_teams', master_teams,
                              'scripts', docs_found, 'meetings', meetings_found, 'actions', actions_found,
                              'objectives', objectives_found, 'projections', projections_found);
  end if;
  esc := search_escape_like(ltrim(term, '#'));
  contains_pat := '%' || esc || '%';
  prefix_pat := esc || '%';
  deep := num is null and length(term) >= 3;

  -- PEOPLE (skipped for pure number lookups)
  if num is null then
    select coalesce(jsonb_agg(to_jsonb(x) - 'sort_name' order by x.score desc, x.sort_name), '[]'::jsonb)
      into people
      from (
        select
          pr.id, pr.username, pr.full_name, pr.avatar_url,
          case when pr.username is null and pr.full_name is null
               then split_part(pr.email, '@', 1) end as email_name,
          coalesce(pr.username, pr.full_name, split_part(pr.email, '@', 1)) as sort_name,
          (pr.id = auth.uid()) as is_self,
          exists (
            select 1 from team_members tm
            where tm.user_id = pr.id and tm.status = 'active'
              and tm.team_id in (select my_team_ids())
          ) as is_teammate,
          coalesce((
            select jsonb_agg(tm.team_id) from team_members tm
            where tm.user_id = pr.id and tm.team_id in (select my_master_team_ids())
          ), '[]'::jsonb) as member_of,
          coalesce((
            select jsonb_agg(ti.team_id) from team_invites ti
            where ti.invited_user_id = pr.id and ti.status = 'pending'
              and ti.expires_at > now()
              and ti.team_id in (select my_master_team_ids())
          ), '[]'::jsonb) as invited_to,
          (case
             when lower(pr.username) = term or lower(pr.full_name) = term then 3
             when lower(pr.username) like prefix_pat or lower(pr.full_name) like prefix_pat then 2
             else 0
           end
           + greatest(
               word_similarity(term, lower(coalesce(pr.username, ''))),
               word_similarity(term, lower(coalesce(pr.full_name, '')))
             )) as score
        from profiles pr
        where lower(pr.username) like contains_pat
           or lower(pr.full_name) like contains_pat
           or term <% lower(coalesce(pr.username, ''))
           or term <% lower(coalesce(pr.full_name, ''))
           or (position('@' in term) > 0 and lower(pr.email) like prefix_pat)
        order by score desc
        limit lim
      ) x;
  end if;

  -- LONG VIDEOS (RLS: your teams only). The picture: Thumbnail Studio's
  -- winner (1.25.0), else the first thumbnail idea. Also found by another
  -- title, or (3+ letters) by its theme, hook, notes or description.
  select coalesce(jsonb_agg(to_jsonb(x) - 'updated_at' order by x.score desc, x.updated_at desc), '[]'::jsonb)
    into projects
    from (
      select
        p.id, p.entry_number, p.title, p.stage, p.expected_date, p.updated_at,
        alt.title as matched_title,
        other.field as matched_field,
        case when other.field is not null then search_snippet(other.txt, other.pos, 120) end as matched_text,
        th.storage_path as thumbnail_path,
        win.id as winner_id,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and p.entry_number = num then 4
           when lower(p.title) = term then 3
           when lower(p.title) like prefix_pat then 2
           when lower(p.title) like contains_pat then 1
           when alt.title is not null then 0.8
           when other.field is not null then 0.5
           else 0
         end
         + word_similarity(term, lower(p.title))) as score
      from long_video_projects p
      join teams t on t.id = p.team_id
      left join lateral (
        select pt.title from project_titles pt
        where pt.project_id = p.id
          and lower(pt.title) like contains_pat
          and lower(pt.title) <> lower(p.title)
        order by pt.position
        limit 1
      ) alt on true
      left join lateral (
        select f.field, f.txt, strpos(lower(f.txt), term) as pos
        from (values (1, 'theme', p.theme), (2, 'subtheme', p.subtheme), (3, 'hook', p.hook),
                     (4, 'description', p.description), (5, 'notes', p.notes)) f(n, field, txt)
        where deep and f.txt is not null and lower(f.txt) like contains_pat
        order by f.n
        limit 1
      ) other on true
      left join lateral (
        select th.storage_path from project_thumbnails th
        where th.project_id = p.id
        order by th.position
        limit 1
      ) th on true
      left join lateral (
        select e.id from package_entries e
        where e.project_id = p.id and e.is_winner and e.thumbnail_storage_path is not null
        order by e.position
        limit 1
      ) win on true
      where (num is not null and p.entry_number = num)
         or lower(p.title) like contains_pat
         or term <% lower(p.title)
         or alt.title is not null
         or other.field is not null
      order by score desc, p.updated_at desc
      limit lim
    ) x;

  -- SHORTS (RLS: your teams only). Also found (3+ letters) by their caption.
  select coalesce(jsonb_agg(to_jsonb(x) order by x.score desc, x.entry_number desc), '[]'::jsonb)
    into shorts
    from (
      select
        s.id, s.entry_number, s.title, s.stage, s.planned_date,
        (select count(*) from short_video_posts sp
          where sp.short_id = s.id and sp.platform = any(s.platforms)) as posted_count,
        cardinality(s.platforms) as platform_count,
        case when deep and lower(s.title) not like contains_pat and lower(s.caption) like contains_pat
             then 'caption' end as matched_field,
        case when deep and lower(s.title) not like contains_pat and lower(s.caption) like contains_pat
             then search_snippet(s.caption, strpos(lower(s.caption), term), 120) end as matched_text,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and s.entry_number = num then 4
           when lower(s.title) = term then 3
           when lower(s.title) like prefix_pat then 2
           when lower(s.title) like contains_pat then 1
           when deep and lower(s.caption) like contains_pat then 0.5
           else 0
         end
         + word_similarity(term, lower(s.title))) as score
      from short_videos s
      join teams t on t.id = s.team_id
      where (num is not null and s.entry_number = num)
         or lower(s.title) like contains_pat
         or term <% lower(s.title)
         or (deep and lower(s.caption) like contains_pat)
      order by score desc
      limit lim
    ) x;

  -- TEAMS (skipped for pure number lookups)
  if num is null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.score desc, x.name), '[]'::jsonb)
      into teams_found
      from (
        select
          t.id, t.name, t.color, t.logo_url,
          (t.id in (select my_master_team_ids())) as is_master,
          (select count(*) from team_members tm where tm.team_id = t.id and tm.status = 'active') as member_count,
          (case
             when lower(t.name) = term then 3
             when lower(t.name) like prefix_pat then 2
             else 0
           end + word_similarity(term, lower(t.name))) as score
        from teams t
        where lower(t.name) like contains_pat or term <% lower(t.name)
        order by score desc
        limit lim
      ) x;
  end if;

  if deep then
    -- SCRIPTS AND RESEARCH: search_docs (your teams' documents, with the index).
    docs_found := search_docs(term, lim);

    -- MEETINGS (RLS: your teams'): by title, agenda or notes. The nearest
    -- in time first among equals.
    select coalesce(jsonb_agg(to_jsonb(x) - 'gap' order by x.score desc, x.gap), '[]'::jsonb)
      into meetings_found
      from (
        select
          m.id, m.title, m.starts_at, m.duration_min, m.status, m.location,
          case when lower(m.title) like contains_pat or term <% lower(m.title) then null
               when lower(m.agenda) like contains_pat then 'agenda'
               when lower(m.notes) like contains_pat then 'notes' end as matched_field,
          case when lower(m.title) like contains_pat or term <% lower(m.title) then null
               when lower(m.agenda) like contains_pat then search_snippet(m.agenda, strpos(lower(m.agenda), term), 120)
               when lower(m.notes) like contains_pat then search_snippet(m.notes, strpos(lower(m.notes), term), 120) end as matched_text,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          abs(extract(epoch from (m.starts_at - now()))) as gap,
          (case
             when lower(m.title) = term then 3
             when lower(m.title) like prefix_pat then 2
             when lower(m.title) like contains_pat then 1
             when term <% lower(m.title) then 0.6
             else 0.5
           end + word_similarity(term, lower(m.title))) as score
        from meetings m
        join teams t on t.id = m.team_id
        where lower(m.title) like contains_pat
           or term <% lower(m.title)
           or lower(m.agenda) like contains_pat
           or lower(m.notes) like contains_pat
        order by score desc, gap
        limit lim
      ) x;

    -- MEETING ACTION ITEMS (RLS: your teams'): open ones first.
    select coalesce(jsonb_agg(to_jsonb(x) - 'created_at' order by x.score desc, x.done, x.created_at desc), '[]'::jsonb)
      into actions_found
      from (
        select
          a.id, a.text, a.meeting_id, a.due_date, a.created_at,
          (a.done_at is not null) as done,
          (a.owner_id is not null and a.owner_id = auth.uid()) as mine,
          coalesce(pr.username, pr.full_name, split_part(pr.email, '@', 1)) as owner_name,
          m.title as meeting_title,
          m.starts_at as meeting_at,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          (case
             when lower(a.text) = term then 3
             when lower(a.text) like prefix_pat then 2
             when lower(a.text) like contains_pat then 1
             else 0
           end + word_similarity(term, lower(a.text))) as score
        from meeting_actions a
        join meetings m on m.id = a.meeting_id
        join teams t on t.id = a.team_id
        left join profiles pr on pr.id = a.owner_id
        where lower(a.text) like contains_pat or term <% lower(a.text)
        order by score desc, done, a.created_at desc
        limit lim
      ) x;

    -- OBJECTIVES (RLS: your teams')
    select coalesce(jsonb_agg(to_jsonb(x) - 'position' order by x.score desc, x.position), '[]'::jsonb)
      into objectives_found
      from (
        select
          o.id, o.title, o.period, o.color, o.position,
          (o.paused_at is not null) as paused,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          (case
             when lower(o.title) = term then 3
             when lower(o.title) like prefix_pat then 2
             when lower(o.title) like contains_pat then 1
             else 0
           end + word_similarity(term, lower(o.title))) as score
        from objectives o
        join teams t on t.id = o.team_id
        where lower(o.title) like contains_pat or term <% lower(o.title)
        order by score desc, o.position
        limit lim
      ) x;

    -- PROJECTIONS (RLS: your teams', money ones only if you see revenue)
    select coalesce(jsonb_agg(to_jsonb(x) - 'position' order by x.score desc, x.position), '[]'::jsonb)
      into projections_found
      from (
        select
          p.id, p.title, p.deadline, p.color, p.position,
          (p.achieved_at is not null) as achieved,
          (p.ended_at is not null) as ended,
          (p.archived_at is not null) as archived,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          (case
             when lower(p.title) = term then 3
             when lower(p.title) like prefix_pat then 2
             when lower(p.title) like contains_pat then 1
             else 0
           end + word_similarity(term, lower(p.title))) as score
        from projections p
        join teams t on t.id = p.team_id
        where lower(p.title) like contains_pat or term <% lower(p.title)
        order by score desc, p.position
        limit lim
      ) x;
  end if;

  return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                            'teams', teams_found, 'master_teams', master_teams,
                            'scripts', docs_found, 'meetings', meetings_found, 'actions', actions_found,
                            'objectives', objectives_found, 'projections', projections_found);
end;
$$;

revoke all on function global_search(text, int) from public, anon;
grant execute on function global_search(text, int) to authenticated;
