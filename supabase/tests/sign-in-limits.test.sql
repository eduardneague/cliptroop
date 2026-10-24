-- Checks for 0105 (sign-in limits): wrong passwords counted per account and
-- address (hashes only), the wait after 8 / 30 / 40 in 15 minutes, a right one
-- clearing its account, old rows going, and nobody but the server touching it.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- 1. Nobody but the server: not the table, not the functions.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    begin
      execute format('set local role %I', r);
      perform 1 from sign_in_failures limit 1;
      raise exception '1: % could read sign_in_failures', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
    begin
      execute format('set local role %I', r);
      perform sign_in_wait('a', 'b');
      raise exception '1: % could call sign_in_wait', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
    begin
      execute format('set local role %I', r);
      perform sign_in_note('a', 'b', false);
      raise exception '1: % could call sign_in_note', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end;
$$;

-- 2. The server can.
begin;
  set local role service_role;
  do $$
  begin
    perform sign_in_note('t2-account', 't2-address', false);
    if sign_in_wait('t2-account', 't2-address') <> 0 then
      raise exception '2: one wrong try should not wait';
    end if;
  end;
  $$;
rollback;

-- 3. One account from one address: 7 wrong tries go on, the 8th waits about 15 minutes.
begin;
  set local role service_role;
  do $$
  declare
    w int;
  begin
    for i in 1..7 loop perform sign_in_note('t3-account', 't3-address', false); end loop;
    if sign_in_wait('t3-account', 't3-address') <> 0 then
      raise exception '3: 7 wrong tries should not wait';
    end if;
    perform sign_in_note('t3-account', 't3-address', false);
    w := sign_in_wait('t3-account', 't3-address');
    if w < 890 or w > 900 then
      raise exception '3: 8 wrong tries should wait 15 minutes, waits % s', w;
    end if;
    -- Another account from the same address isn't held up by it.
    if sign_in_wait('t3-other', 't3-address') <> 0 then
      raise exception '3: another account from the same address should not wait';
    end if;
    -- A right password clears the account's count.
    perform sign_in_note('t3-account', 't3-address', true);
    if sign_in_wait('t3-account', 't3-address') <> 0 or exists (select 1 from sign_in_failures where account = 't3-account') then
      raise exception '3: a right password should clear its account';
    end if;
  end;
  $$;
rollback;

-- 4. Only the last 15 minutes count, and the wait is until the 8th most recent is 15 minutes old.
begin;
  insert into sign_in_failures (account, address, at)
  select 't4-account', 't4-address', now() - interval '20 minutes' from generate_series(1, 20);
  insert into sign_in_failures (account, address, at)
  select 't4-account', 't4-address', now() - interval '10 minutes' from generate_series(1, 8);
  set local role service_role;
  do $$
  declare
    w int := sign_in_wait('t4-account', 't4-address');
  begin
    if w < 295 or w > 300 then
      raise exception '4: 8 wrong tries 10 minutes ago should wait 5 more minutes, waits % s', w;
    end if;
  end;
  $$;
rollback;

-- 5. One account from many addresses: the 30th waits.
begin;
  set local role service_role;
  do $$
  begin
    for i in 1..29 loop perform sign_in_note('t5-account', 't5-address-' || i, false); end loop;
    if sign_in_wait('t5-account', 't5-new') <> 0 then
      raise exception '5: 29 wrong tries from many addresses should not wait';
    end if;
    perform sign_in_note('t5-account', 't5-address-30', false);
    if sign_in_wait('t5-account', 't5-new') = 0 then
      raise exception '5: 30 wrong tries for one account should wait, from anywhere';
    end if;
  end;
  $$;
rollback;

-- 6. One address trying many accounts: the 40th waits, for any account.
begin;
  set local role service_role;
  do $$
  begin
    for i in 1..39 loop perform sign_in_note('t6-account-' || i, 't6-address', false); end loop;
    if sign_in_wait('t6-fresh', 't6-address') <> 0 then
      raise exception '6: 39 wrong tries from one address should not wait';
    end if;
    perform sign_in_note('t6-account-40', 't6-address', false);
    if sign_in_wait('t6-fresh', 't6-address') = 0 then
      raise exception '6: 40 wrong tries from one address should wait, for any account';
    end if;
    if sign_in_wait('t6-fresh', 't6-elsewhere') <> 0 then
      raise exception '6: the same account from another address should not wait';
    end if;
  end;
  $$;
rollback;

-- 7. Rows older than a day go with the next try.
begin;
  insert into sign_in_failures (account, address, at) values ('t7-old', 't7-address', now() - interval '25 hours');
  set local role service_role;
  select sign_in_note('t7-account', 't7-address', false);
  do $$
  begin
    if exists (select 1 from sign_in_failures where account = 't7-old') then
      raise exception '7: a day-old row should be gone';
    end if;
  end;
  $$;
rollback;
