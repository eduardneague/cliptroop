-- 0127 (1.50.0): comments on scripts, rehauled. The owner (Nov 4 2026): "i want to be able to edit comments as well
-- from here and also also be able to add general comments as well, not linked to anything in particular. i want to be
-- able to select multiple lines for a comment or an editing idea".
--
--   * edited_at: when the author last changed the words. Set by the trigger only (nobody sets it by hand); a copy
--     (script_copy_comments) starts without one.
--   * quote: '' is a general comment (on the whole document, no words of it); a quote may run over several lines and
--     paragraphs, up to 4,000 characters (it was one paragraph, at most 500). Its place still can't change.
--   * script_comments_write(): 0092's, plus edited_at.
--
-- Additive; safe to run twice.

alter table script_comments add column if not exists edited_at timestamptz;

alter table script_comments drop constraint if exists script_comments_quote_check;
alter table script_comments add constraint script_comments_quote_check check (char_length(quote) between 0 and 4000);

create or replace function script_comments_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select team_id into new.team_id from scripts where id = new.script_id;
    -- A copy (script_copy_comments, 1.27.5) keeps who wrote it and when; anything else is the writer's, now.
    if coalesce(current_setting('vp.copying_comments', true), '') <> 'on' then
      new.author_id := auth.uid();
      new.created_at := now();
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
    new.edited_at := null;
  else
    if new.quote is distinct from old.quote or new.occurrence is distinct from old.occurrence
       or new.script_id is distinct from old.script_id or new.team_id is distinct from old.team_id then
      raise exception 'A comment''s place in the document can''t be changed.' using errcode = '42501';
    end if;
    if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at
       or ((new.body is distinct from old.body
            or new.sketch_path is distinct from old.sketch_path
            or new.sketch_w is distinct from old.sketch_w
            or new.sketch_h is distinct from old.sketch_h
            or new.kind is distinct from old.kind)
           and old.author_id is distinct from auth.uid()) then
      raise exception 'Only resolving can change someone else''s comment.' using errcode = '42501';
    end if;
    if new.resolved_at is distinct from old.resolved_at then
      new.resolved_at := case when new.resolved_at is null then null else now() end;
      new.resolved_by := case when new.resolved_at is null then null else auth.uid() end;
    end if;
    -- 1.50.0: "edited" means the author changed the words, and only that.
    new.edited_at := case when new.body is distinct from old.body then now() else old.edited_at end;
  end if;
  if new.sketch_path is not null
     and new.sketch_path not like (new.team_id::text || '/' || new.script_id::text || '/%.png') then
    raise exception 'That drawing doesn''t belong to this document.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists script_comments_write on script_comments;
create trigger script_comments_write before insert or update on script_comments
  for each row execute procedure script_comments_write();

notify pgrst, 'reload schema';
