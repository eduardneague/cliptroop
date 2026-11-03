-- ============================================================================
-- 0102: Remove a channel from a niche, from the top of a video (1.30.1)
--
--   * outliers_video(): 'niches' is now exactly the niches the video shows
--     in (its channel counts there, or the niche's searches found it and it
--     fits), never one its channel was taken out of. The video's panel
--     offers "Remove from <niche>" for these. Before, it also listed niches
--     whose searches merely came across the video, and ones its channel had
--     been taken out of. Otherwise as 0094.
--
-- Nothing else changes. Safe to run twice. Staging first, then production.
-- ============================================================================

create or replace function outliers_video(p_team uuid, p_video text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v yt_videos;
  c yt_channels;
begin
  if p_team is null or not is_team_member(p_team) then
    return null;
  end if;
  select * into v from yt_videos where id = p_video;
  if not found then
    return null;
  end if;
  select * into c from yt_channels where id = v.channel_id;
  return jsonb_build_object(
    'video', to_jsonb(v) - 'fmt_v',
    'channel', to_jsonb(c) - 'profile',
    'peers', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'views', x.views, 'score', x.score, 'published_at', x.published_at) order by x.published_at)
        from (
          select b.id, b.title, b.views, b.score, b.published_at from yt_videos b
           where b.channel_id = v.channel_id and b.kind = v.kind
           order by abs(extract(epoch from (b.published_at - v.published_at))) asc
           limit 41
        ) x
    ), '[]'::jsonb),
    'stats', coalesce((select jsonb_agg(jsonb_build_object('at', s.at, 'views', s.views, 'likes', s.likes, 'comments', s.comments) order by s.at) from yt_video_stats s where s.video_id = v.id), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('at', ch.at, 'field', ch.field, 'before', ch.before, 'after', ch.after, 'views', ch.views) order by ch.at desc) from yt_video_changes ch where ch.video_id = v.id), '[]'::jsonb),
    'saves', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'folder_id', s.folder_id)) from outlier_saves s where s.team_id = p_team and s.video_id = v.id), '[]'::jsonb),
    'tracked', exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = v.channel_id),
    'blocked', exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = v.channel_id),
    -- The niches it shows in (1.30.1): its channel counts there (one of the niche's own, or found
    -- and a fit), or the niche's searches found this video and it fits; never where its channel
    -- was taken out. As outlier_members and outlier_member_hits decide.
    'niches', coalesce((
      select jsonb_agg(n.id)
        from outlier_niches n
       where (n.team_id = p_team or n.team_id is null)
         and not exists (select 1 from outlier_niche_channels x where x.niche_id = n.id and x.channel_id = v.channel_id and x.hidden)
         and (exists (select 1 from outlier_niche_channels nc
                       where nc.niche_id = n.id and nc.channel_id = v.channel_id
                         and (nc.source in ('manual', 'seed', 'audience') or (not n.only_group and nc.rel_v >= 2 and nc.verdict = 'ok')))
              or (not n.only_group and exists (select 1 from outlier_niche_hits h where h.niche_id = n.id and h.video_id = v.id and h.ok is true)))
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function outliers_video(uuid, text) from public, anon;
grant execute on function outliers_video(uuid, text) to authenticated, service_role;
