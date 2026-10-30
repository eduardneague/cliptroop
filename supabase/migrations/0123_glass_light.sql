-- 0123 (1.45.0): the light that follows the pointer, on or off.
--
-- Liquid glass lights up the edge of the card, menu or bar under the pointer
-- (components/ui/glass.tsx LiquidLight; the CSS in app/globals.css). The owner:
-- "a setting to be able to turn off the light following your mouse across
-- widgets and the app, to be able to turn it on or off". It's kept on the
-- account with the rest of the glass look (Settings → Preferences → Glass),
-- on unless switched off.
--
-- Before this runs, the app reads the look without it (the light stays on,
-- and switching it off is kept on that device only). Additive; safe to run twice.

alter table public.profiles add column if not exists glass_light boolean not null default true;

comment on column public.profiles.glass_light is
  'Liquid glass: the light on the edge of the pane under the pointer (1.45.0). Off: none of it is drawn.';

-- Each person changes their own (profiles' rules), this column like the rest of the look.
grant update (glass_light) on profiles to authenticated;
