-- ============================================================================
-- 0096: The colours behind the glass (1.29.2)
--
-- Settings → Preferences → Glass → Colours behind the glass, per person:
--
--   * profiles.glass_wash: null = your colour theme's own (as before), 'none'
--     (no colours, the glass over the plain paper), another theme's id
--     ('ink', 'ocean'…), a blend's ('sunset', 'aurora'…) or 'custom'. Only
--     short lower-case names; the app knows which ones exist (an unknown one
--     reads as your theme's).
--   * profiles.glass_wash_colors: your own three colours ('#rrggbb'), kept
--     even while another choice is on, so Custom comes back as you left it.
--
-- Yours to change (like the other glass choices since 0093); nobody else's.
-- The glass slider keeps its 0–100: since 1.29.2 0 is solid and 100 nearly
-- clear (the app's CSS), no change here.
--
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

alter table profiles add column if not exists glass_wash text;
alter table profiles add column if not exists glass_wash_colors text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_glass_wash_check') then
    alter table profiles add constraint profiles_glass_wash_check
      check (glass_wash is null or glass_wash ~ '^[a-z]{2,20}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_glass_wash_colors_check') then
    alter table profiles add constraint profiles_glass_wash_colors_check
      check (
        glass_wash_colors is null
        or (
          cardinality(glass_wash_colors) between 1 and 3
          and array_position(glass_wash_colors, null) is null
          and array_to_string(glass_wash_colors, ',') ~ '^#[0-9a-f]{6}(,#[0-9a-f]{6}){0,2}$'
        )
      );
  end if;
end;
$$;

grant update (glass_wash, glass_wash_colors) on profiles to authenticated;
