-- Hidden Kenya: allow the audit log to forget a deleted user.
--
-- audit_logs.actor_id references auth.users ON DELETE SET NULL. The append-only trigger must
-- permit exactly that update (actor_id -> null, every other column unchanged) so accounts can
-- be deleted, while still blocking any other modification or deletion.

create or replace function app_private.audit_logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_id is null
     and old.actor_id is not null
     and (new.id, new.action, new.entity_type, new.entity_id, new.metadata, new.created_at)
         is not distinct from (old.id, old.action, old.entity_type, old.entity_id, old.metadata, old.created_at) then
    return new;
  end if;
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

drop trigger audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function app_private.audit_logs_guard();

revoke execute on function app_private.audit_logs_guard() from public;
grant execute on function app_private.audit_logs_guard() to anon, authenticated, service_role;
