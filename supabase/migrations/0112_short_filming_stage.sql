-- ============================================================================
-- 0112: a Filming step for shorts (1.36.0), between Script and Editing.
--
-- On its own file, as 0044 did for long videos' Review: PostgreSQL only lets
-- a new enum value be used once the statement that adds it is committed.
-- 0113 uses it. Staging first, then production.
-- ============================================================================

alter type short_stage add value if not exists 'filming' after 'script';
