-- ============================================================================
-- 0075: what the app stores, for the developer's Usage page (1.13.0)
--
--   * developer_usage(): one JSON with the database's size, the biggest
--     tables (with exact row counts for ours), storage per bucket, uploads
--     per day (30 days), every team (members, videos, files, storage, rows
--     and an estimate of its share of the database) and every person
--     (teams, sign-ins, videos and files uploaded, tasks done).
--   * Only the server (service role) can call it: /developer checks that the
--     caller is a developer account first. Nobody signed in can, so a team
--     never sees another team's numbers.
--
-- Which team a stored file belongs to comes from its path's first folder,
-- the same rule the storage policies use: the team (review-videos,
-- package-thumbs, mockup-library, script-sketches, team-logos), a long video
-- (thumbnails, comment-attachments) or a script (script-images). Avatars and
-- report files belong to a person, not a team.
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

create or replace function public.developer_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  t record;
  r record;
  n_total bigint;
  t_bytes bigint;
  team_rows jsonb := '{}'::jsonb;  -- { "<team id>": { "rows": n, "bytes": estimate } }
  table_rows jsonb := '{}'::jsonb; -- { "<public table>": exact row count }
  result jsonb;
begin
  -- Exact rows of every table of ours; for the ones with a team_id, how many
  -- belong to each team (and that share of the table's size: an estimate).
  for t in
    select c.relname, c.oid,
      exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'team_id' and not a.attisdropped) as has_team
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('select count(*) from public.%I', t.relname) into n_total;
    table_rows := table_rows || jsonb_build_object(t.relname, n_total);
    continue when n_total = 0 or not t.has_team;
    t_bytes := pg_total_relation_size(t.oid);
    for r in execute format('select team_id::text as team, count(*) as n from public.%I where team_id is not null group by team_id', t.relname) loop
      team_rows := team_rows || jsonb_build_object(r.team, jsonb_build_object(
        'rows', coalesce((team_rows -> r.team ->> 'rows')::bigint, 0) + r.n,
        'bytes', coalesce((team_rows -> r.team ->> 'bytes')::numeric, 0) + round(t_bytes::numeric * r.n / n_total)
      ));
    end loop;
  end loop;

  with objs as (
    select
      o.bucket_id,
      case when o.metadata ->> 'size' ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end as bytes,
      o.created_at,
      coalesce(o.owner, case when o.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then o.owner_id::uuid end) as owner,
      case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(o.name, '/', 1)::uuid end as first
    from storage.objects o
  ),
  owned as (
    select x.*,
      case
        when x.bucket_id in ('team-logos', 'review-videos', 'package-thumbs', 'mockup-library', 'script-sketches') then x.first
        when x.bucket_id in ('thumbnails', 'comment-attachments') then (select p.team_id from long_video_projects p where p.id = x.first)
        when x.bucket_id = 'script-images' then (select s.team_id from scripts s where s.id = x.first)
      end as team_id
    from objs x
  )
  select jsonb_build_object(
    'at', now(),
    'database', jsonb_build_object('bytes', pg_database_size(current_database())),
    'storage', jsonb_build_object('bytes', (select coalesce(sum(bytes), 0) from owned), 'files', (select count(*) from owned)),
    'counts', jsonb_build_object(
      'people', (select count(*) from auth.users),
      'people7', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'people30', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'newPeople30', (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'teams', (select count(*) from teams),
      'shorts', (select count(*) from short_videos),
      'longs', (select count(*) from long_video_projects),
      'videoFiles', (select count(*) from short_video_versions where deleted_at is null),
      'videoBytes', (select coalesce(sum(size_bytes), 0) from short_video_versions where deleted_at is null),
      'videoFilesCleaned', (select count(*) from short_video_versions where deleted_at is not null),
      'scripts', (select count(*) from scripts),
      'postsPublished', (select count(*) from social_posts where status = 'published'),
      'tasksDone', (select count(*) from tasks where state = 'done')
    ),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.bucket_id, 'files', b.files, 'bytes', b.bytes, 'last', b.last) order by b.bytes desc)
      from (select bucket_id, count(*) as files, sum(bytes) as bytes, max(created_at) as last from owned group by bucket_id) b
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('schema', x.schema, 'name', x.name, 'bytes', x.bytes, 'rows', x.rows, 'exact', x.exact) order by x.bytes desc)
      from (
        select ns.nspname as schema, c.relname as name, pg_total_relation_size(c.oid) as bytes,
          case when ns.nspname = 'public' and table_rows ? c.relname then (table_rows ->> c.relname)::bigint else greatest(c.reltuples, 0)::bigint end as rows,
          ns.nspname = 'public' and table_rows ? c.relname as exact
        from pg_class c
        join pg_namespace ns on ns.oid = c.relnamespace
        where c.relkind in ('r', 'p') and ns.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and ns.nspname not like 'pg_temp%'
        order by pg_total_relation_size(c.oid) desc
        limit 80
      ) x
    ), '[]'::jsonb),
    'uploads', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'files', d.files, 'bytes', d.bytes) order by d.day)
      from (select created_at::date as day, count(*) as files, sum(bytes) as bytes from owned where created_at > now() - interval '30 days' group by 1) d
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tm.id, 'name', tm.name, 'createdAt', tm.created_at,
        'members', (select count(*) from team_members m where m.team_id = tm.id and m.status = 'active'),
        'shorts', (select count(*) from short_videos s where s.team_id = tm.id),
        'longs', (select count(*) from long_video_projects p where p.team_id = tm.id),
        'videoFiles', (select count(*) from short_video_versions v where v.team_id = tm.id and v.deleted_at is null),
        'videoBytes', (select coalesce(sum(v.size_bytes), 0) from short_video_versions v where v.team_id = tm.id and v.deleted_at is null),
        'files', (select count(*) from owned o where o.team_id = tm.id),
        'storageBytes', (select coalesce(sum(o.bytes), 0) from owned o where o.team_id = tm.id),
        'rows', coalesce((team_rows -> tm.id::text ->> 'rows')::bigint, 0),
        'dbBytes', coalesce((team_rows -> tm.id::text ->> 'bytes')::numeric, 0),
        'postsPublished', (select count(*) from social_posts sp where sp.team_id = tm.id and sp.status = 'published'),
        'lastActivity', (select max(coalesce(k.completed_at, k.activated_at, k.created_at)) from tasks k where k.team_id = tm.id)
      ) order by tm.created_at)
      from teams tm
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', coalesce(nullif(p.full_name, ''), p.username), 'username', p.username,
        'createdAt', u.created_at, 'lastSignIn', u.last_sign_in_at,
        'teams', (select coalesce(jsonb_agg(tt.name order by tt.name), '[]'::jsonb) from team_members m join teams tt on tt.id = m.team_id where m.user_id = u.id and m.status = 'active'),
        'videos', (select count(*) from short_video_versions v where v.uploaded_by = u.id and v.deleted_at is null),
        'videoBytes', (select coalesce(sum(v.size_bytes), 0) from short_video_versions v where v.uploaded_by = u.id and v.deleted_at is null),
        'files', (select count(*) from owned o where o.owner = u.id and o.bucket_id <> 'review-videos'),
        'fileBytes', (select coalesce(sum(o.bytes), 0) from owned o where o.owner = u.id and o.bucket_id <> 'review-videos'),
        'tasksDone', (select count(*) from tasks k where k.user_id = u.id and k.state = 'done')
      ) order by u.created_at)
      from auth.users u
      left join profiles p on p.id = u.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.developer_usage() from public, anon, authenticated;
grant execute on function public.developer_usage() to service_role;
