-- ============================================================================
-- 0043: "Test the timer" + Vercel protection bypass
--
--   * posting_ping(team): calls the app right now, the same way the timer
--     does, so the Posting page can show a fresh result (masters and
--     schedulers only).
--   * Optional Vault secret `vercel_bypass`: Vercel's "Protection Bypass
--     for Automation" key. If present, the timer sends it, so Vercel
--     Authentication can stay ON for the site.
-- Staging first, then production.
-- ============================================================================

create or replace function posting_call(p_body jsonb)
returns bigint
language plpgsql
security definer set search_path = public, vault
as $$
declare
  v_url text;
  v_secret text;
  v_bypass text;
  v_headers jsonb;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'posting_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  select decrypted_secret into v_bypass from vault.decrypted_secrets where name = 'vercel_bypass';
  if v_url is null or v_secret is null then
    return null;
  end if;
  v_headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
  if v_bypass is not null then
    v_headers := v_headers || jsonb_build_object('x-vercel-protection-bypass', v_bypass);
  end if;
  return net.http_post(url := v_url, headers := v_headers, body := p_body, timeout_milliseconds := 60000);
end;
$$;
revoke all on function posting_call(jsonb) from public, anon, authenticated;

-- The every-minute tick now goes through posting_call (bypass support).
create or replace function run_posting_tick()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from social_posts
     where status in ('scheduled', 'uploading', 'processing', 'waiting') and next_attempt_at <= now()
  ) then
    return;
  end if;
  perform posting_call('{}'::jsonb);
end;
$$;
revoke all on function run_posting_tick() from public, anon, authenticated;

create or replace function posting_ping(p_team uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not (is_team_master(p_team) or has_team_role(p_team, 'publisher')) then
    raise exception 'Only the master or a scheduler can test the timer.' using errcode = '42501';
  end if;
  return posting_call('{"ping": true}'::jsonb) is not null;
end;
$$;
grant execute on function posting_ping(uuid) to authenticated;
