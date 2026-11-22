-- Freeze guard for existing JWT sessions. REVIEW and TEST before applying to production.
-- Restrictive policies combine with existing permissive owner policies (AND).
-- This migration does not ban any user and does not delete any data.
create schema if not exists gochat_security_private;
revoke all on schema gochat_security_private from public;
grant usage on schema gochat_security_private to authenticated;

create or replace function gochat_security_private.current_account_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;
revoke all on function gochat_security_private.current_account_active() from public, anon;
grant execute on function gochat_security_private.current_account_active() to authenticated;

drop policy if exists "gochat_active_account_guard" on public.user_data;
create policy "gochat_active_account_guard"
on public.user_data as restrictive for all to authenticated
using ((select gochat_security_private.current_account_active()))
with check ((select gochat_security_private.current_account_active()));

drop policy if exists "gochat_subscription_active_guard" on public.subscriptions;
create policy "gochat_subscription_active_guard"
on public.subscriptions as restrictive for all to authenticated
using ((select gochat_security_private.current_account_active()))
with check ((select gochat_security_private.current_account_active()));
