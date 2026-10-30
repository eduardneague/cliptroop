-- ============================================================================
-- 0121: the PFA's activity (CAEN) takes a longer text (1.43.0).
--
-- The owner (Oct 29 2026): "la activitatea caen exista limita de caractere".
-- 0120 kept it to 80 characters, and a code with its name ("5911 Activități de
-- producție cinematografică, video și de programe de televiziune") is already
-- longer than that, more so with a second code. Now up to 500. The old check
-- (named by Postgres from the column: business_profiles_caen_check) goes, the
-- new one has a name of its own.
--
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

alter table business_profiles drop constraint if exists business_profiles_caen_check;
alter table business_profiles drop constraint if exists business_profiles_caen_len;
alter table business_profiles add constraint business_profiles_caen_len check (char_length(caen) <= 500);
