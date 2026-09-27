-- ============================================================================
-- 0037: animations = Match device / On / Off
--
-- profiles.animations_enabled becomes nullable:
--   null  = match the device (reduce motion on the device turns them off)
--   true  = always on, even if the device asks for reduced motion
--   false = always off
-- Everyone starts on "match device" (the old value was just the default).
-- Staging first, then production.
-- ============================================================================

alter table profiles alter column animations_enabled drop not null;
alter table profiles alter column animations_enabled set default null;
update profiles set animations_enabled = null where animations_enabled is true;
