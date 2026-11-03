-- ============================================================================
-- 0122: Outliers → Audience shows each channel's videos, Shorts too (1.43.0).
--
-- The owner (Oct 29 2026): "in outlier audience i dont just want to see long
-- videos as examples from each channel, id like to see shorts as well and more
-- video examples in there, not just 1 or two, have like 5 or 6 per channel".
-- A card showed the (up to 3) videos of the channel that sent the team viewers,
-- each drawn as a long video. outliers_audience now also answers, for each
-- channel, its best videos of each kind (up to 6 long ones and 6 Shorts, from
-- the last two years, the ones that sent viewers first, then the biggest
-- outliers): id, kind, title (80 characters), views, score, when, and whether
-- it sent the team viewers. The rest of its answer is as 0094 had it.
--
-- yt_videos_channel_idx (channel_id, kind, published_at) serves the reads.
-- Additive (create or replace, same arguments and answer type); safe to run
-- twice. Staging first, then production.
-- ============================================================================

create or replace function outliers_audience(p_team uuid, p_limit int default 120)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if p_team is null or not is_team_member(p_team) then
    return null;
  end if;
  return jsonb_build_object(
    'at', (select s.audience_at from outlier_settings s where s.team_id = p_team),
    'note', (select s.audience_note from outlier_settings s where s.team_id = p_team),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.channel_id, 'views', a.views, 'videos', a.videos, 'ours', a.ours, 'top', a.top,
               'title', c.title, 'handle', c.handle, 'avatar', c.avatar_url, 'subs', c.subscribers,
               'country', coalesce(c.country, c.region_guess), 'lang', c.main_lang,
               'long_median', c.long_median, 'short_median', c.short_median,
               'tracked', exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = a.channel_id),
               'niches', coalesce((select jsonb_agg(nc.niche_id) from outlier_niche_channels nc join outlier_niches n on n.id = nc.niche_id
                                    where n.team_id = p_team and nc.channel_id = a.channel_id and not nc.hidden and nc.source in ('manual', 'seed', 'audience')), '[]'::jsonb),
               'examples', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', x.id, 'kind', x.kind, 'title', left(x.title, 80), 'views', x.views, 'score', x.score,
                          'at', x.published_at, 'sent', x.sent
                        ) order by x.kind, x.rk)
                   from (
                     select v.id, v.kind, v.title, v.views, v.score, v.published_at, v.id = any(a.top) as sent,
                            row_number() over (partition by v.kind
                                               order by (v.id = any(a.top)) desc, v.score desc nulls last, v.views desc nulls last) as rk
                       from yt_videos v
                      where v.channel_id = a.channel_id
                        and v.kind in ('long', 'short')
                        and (v.id = any(a.top) or v.published_at > now() - interval '2 years')
                   ) x
                  where x.rk <= 6
               ), '[]'::jsonb)
             ) order by a.views desc, a.videos desc)
        from (select * from outlier_audience a
               where a.team_id = p_team
                 and not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = a.channel_id)
               order by a.views desc, a.videos desc
               limit least(greatest(coalesce(p_limit, 120), 1), 300)) a
        left join yt_channels c on c.id = a.channel_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function outliers_audience(uuid, int) from public, anon;
grant execute on function outliers_audience(uuid, int) to authenticated, service_role;
