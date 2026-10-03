-- ============================================================================
-- 0044: a Review step for long videos (between Edit and Package).
--
-- On its own file: PostgreSQL only allows a new enum value to be used
-- after the statement that adds it has been committed. 0045 uses it.
-- Staging first, then production.
-- ============================================================================

alter type pipeline_stage add value if not exists 'review' after 'edit';
