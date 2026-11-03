-- ============================================================================
-- 0095: Clearing notifications (1.29.1)
--
-- notifications.cleared_at: when you took it out of the bell (the X on it,
-- or Clear all). The bell lists only the ones you haven't cleared; History
-- still shows the last 2 weeks of everything. Clearing one also marks it
-- read.
--
-- Who can: you, on your own notifications only (the update rule that's
-- there already: recipient_id = you). Since 0022 you may change only
-- is_read; cleared_at joins it. Nothing else about a notification can be
-- changed by its reader.
--
-- The bell's list gets an index of its own (your newest ones, not
-- cleared), so clearing a lot never makes the bell slower.
--
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

alter table notifications add column if not exists cleared_at timestamptz;

grant update (cleared_at) on notifications to authenticated;

create index if not exists notifications_inbox_idx
  on notifications (recipient_id, created_at desc)
  where cleared_at is null;
