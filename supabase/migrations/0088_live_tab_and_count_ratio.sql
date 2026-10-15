-- ============================================================================
-- 0088: live streams told apart from premieres, realtime matched to the
-- platform's own count (1.23.1)
--
--   * analytics_content.live_tab: whether a YouTube video is on the
--     channel's Live tab (YouTube's own list of the channel's live streams).
--     A premiere carries a live stream's details in the Data API (and
--     YouTube Analytics can call it a live stream too), yet on the channel
--     it's a video. Once it's known, it decides the kind: on the Live tab a
--     live stream, not on it a long video (or a Short, when YouTube says so).
--     Null: not known yet (YouTube's creatorContentType decides, as in 0086).
--   * analytics_syncs.live_ratio: the platform's own views per day next to
--     the public counts the 10-minute job reads, over the last days both are
--     complete for: { ratio, from, to, counted, platform, at }. Realtime's
--     hours are scaled by it, so the 48 hours add up to what the platform's
--     own analytics show (the public counts can come in under them).
-- Additive only. Safe to run more than once.
-- ============================================================================

alter table analytics_content add column if not exists live_tab boolean;
alter table analytics_syncs add column if not exists live_ratio jsonb;

-- The kind follows what YouTube says the video is: its Live tab first, then
-- its creatorContentType (0086), else the copy's own guess.
create or replace function analytics_content_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.platform = 'youtube' then
    if new.live_tab is true then
      new.kind := 'live';
    elsif new.live_tab is false and (new.kind = 'live' or new.content_type = 'LIVE_STREAM') then
      -- A premiere (or a stream's details on a video that isn't on the Live tab).
      new.kind := case when new.content_type = 'SHORTS' then 'short' else 'long' end;
    elsif new.content_type is not null then
      new.kind := case new.content_type
        when 'LIVE_STREAM' then 'live'
        when 'SHORTS' then 'short'
        when 'VIDEO_ON_DEMAND' then 'long'
        else new.kind
      end;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists analytics_content_kind on analytics_content;
create trigger analytics_content_kind before insert or update on analytics_content
  for each row execute function analytics_content_kind();
