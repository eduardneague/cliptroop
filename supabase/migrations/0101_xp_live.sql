-- ============================================================================
-- 0101: Clip cheers your XP (1.29.7)
--
--   * my_progress(): your XP so far, and your XP bar's colour (0099), for
--     the little "+40 XP" Clip shows the moment one of your steps is done,
--     and the level up card. Only yours: it reads auth.uid().
--   * tasks joins the realtime publication, so the app hears right away when
--     one of your steps is done (whoever moved the video on). Each person
--     listens to their own rows only (the app filters on user_id, and the
--     tasks policies of 0053 and 0076 still decide who may read what).
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

create or replace function my_progress()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select case
    when auth.uid() is null then null
    else jsonb_build_object(
      'xp', profile_xp(auth.uid()),
      'bar', coalesce((select bar_color from profile_pages where user_id = auth.uid()), 'level')
    )
  end;
$$;
revoke all on function my_progress() from public, anon;
grant execute on function my_progress() to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table tasks;
  exception when others then null;
  end;
end $$;
