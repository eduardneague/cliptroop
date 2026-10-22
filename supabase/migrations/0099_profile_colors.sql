-- ============================================================================
-- 0099: A profile's colours (1.29.5)
--
--   * profile_pages.frame_color: the frame around your picture.
--   * profile_pages.bar_color:   your XP bar (and the bars and icons in
--                                your showcases).
--   * profile_pages.glow_color:  the soft light in your header's corner,
--                                or 'off'.
--
--   Each is 'level' (your level's colour, new every 10 levels; the
--   default), 'theme' (the colour theme of whoever is looking) or a colour
--   as lower-case '#rrggbb'. Yours to change, like the rest of your page
--   (0093's policies: only your own row).
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

alter table profile_pages add column if not exists frame_color text not null default 'level';
alter table profile_pages add column if not exists bar_color text not null default 'level';
alter table profile_pages add column if not exists glow_color text not null default 'level';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_pages_frame_color_check') then
    alter table profile_pages add constraint profile_pages_frame_color_check
      check (frame_color in ('level', 'theme') or frame_color ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_pages_bar_color_check') then
    alter table profile_pages add constraint profile_pages_bar_color_check
      check (bar_color in ('level', 'theme') or bar_color ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_pages_glow_color_check') then
    alter table profile_pages add constraint profile_pages_glow_color_check
      check (glow_color in ('level', 'theme', 'off') or glow_color ~ '^#[0-9a-f]{6}$');
  end if;
end;
$$;

grant insert (frame_color, bar_color, glow_color) on profile_pages to authenticated;
grant update (frame_color, bar_color, glow_color) on profile_pages to authenticated;
