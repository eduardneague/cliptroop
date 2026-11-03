-- ============================================================================
-- 0106: Which videos "Your viewers watch it" is about (1.31.8)
--
--   * outlier_audience.pairs: for each channel the team's viewers watch, up
--     to 12 pairs of [one of the team's videos, the channel's video that sent
--     viewers to it, how many views], most first. The daily audience read
--     (collector.ts → buildAudience) fills them.
--   * outliers_channel(): 'audience' also lists those pairs, with both
--     videos' titles (the team's from its analytics, the channel's from
--     Outliers) and the team's thumbnail. Otherwise as 0094.
--   * Every team's audience is read again on the next Outliers run (it
--     waits 20 hours otherwise), so the pairs show within the hour.
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

alter table outlier_audience add column if not exists pairs jsonb not null default '[]'::jsonb;
do $$
begin
  alter table outlier_audience add constraint outlier_audience_pairs_shape
    check (jsonb_typeof(pairs) = 'array' and jsonb_array_length(pairs) <= 12);
exception when duplicate_object then null;
end $$;

-- Read again on the next run (the pairs come with it).
update outlier_settings set audience_at = null where audience_at is not null;

create or replace function outliers_channel(p_team uuid, p_channel text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c yt_channels;
begin
  if p_team is null or not is_team_member(p_team) then
    return null;
  end if;
  select * into c from yt_channels where id = p_channel;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'channel', to_jsonb(c) - 'profile',
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'title', x.title, 'views', x.views, 'likes', x.likes, 'comments', x.comments, 'score', x.score, 'projected', x.projected,
               'published_at', x.published_at, 'duration_s', x.duration_s, 'kind', x.kind, 'formats', x.formats, 'vph', x.vph
             ) order by x.published_at desc)
        from (
          (select * from yt_videos where channel_id = c.id and kind = 'long' order by published_at desc limit 100)
          union all
          (select * from yt_videos where channel_id = c.id and kind = 'short' order by published_at desc limit 60)
        ) x
    ), '[]'::jsonb),
    'tracked', exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = c.id),
    'blocked', exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = c.id),
    'saves', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'folder_id', s.folder_id)) from outlier_saves s where s.team_id = p_team and s.channel_id = c.id), '[]'::jsonb),
    'niches', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'team', n.team_id is not null, 'source', nc.source, 'relevance', nc.relevance, 'hidden', nc.hidden,
                                          'verdict', nc.verdict, 'grp', nc.source in ('manual', 'seed', 'audience'),
                                          'counted', not nc.hidden and (nc.source in ('manual', 'seed', 'audience') or (not n.only_group and nc.rel_v >= 2 and nc.verdict = 'ok'))))
        from outlier_niche_channels nc join outlier_niches n on n.id = nc.niche_id
       where nc.channel_id = c.id and (n.team_id = p_team or n.team_id is null)
    ), '[]'::jsonb),
    'audience', (
      select jsonb_build_object(
               'views', a.views, 'videos', a.videos, 'ours', a.ours,
               'pairs', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'ours', p.ours, 'from', p.src, 'views', p.views,
                          'ours_title', ac.title, 'ours_thumb', ac.thumbnail_url, 'from_title', yv.title
                        ) order by p.views desc)
                   from (
                     select e->>'ours' as ours, e->>'from' as src, coalesce((e->>'views')::bigint, 0) as views
                       from jsonb_array_elements(case when jsonb_typeof(a.pairs) = 'array' then a.pairs else '[]'::jsonb end) e
                   ) p
                   left join analytics_content ac on ac.team_id = p_team and ac.platform = 'youtube' and ac.external_id = p.ours
                   left join yt_videos yv on yv.id = p.src
                  where p.ours is not null and p.src is not null
               ), '[]'::jsonb)
             )
        from outlier_audience a where a.team_id = p_team and a.channel_id = c.id
    )
  );
end;
$$;
revoke all on function outliers_channel(uuid, text) from public, anon;
grant execute on function outliers_channel(uuid, text) to authenticated, service_role;
