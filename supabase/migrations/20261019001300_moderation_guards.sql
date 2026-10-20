-- Hidden Kenya: moderation guards for photos and verified business names.

-- New photos on a live listing send it back to review, like other material edits.
create or replace function app_private.images_require_rereview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.moderation_bypass', 'on', true);
  update public.experiences
     set status = 'pending_review', submitted_at = now()
   where id = new.experience_id and status in ('published', 'paused');
  perform set_config('app.moderation_bypass', 'off', true);
  return new;
end;
$$;

create trigger experience_images_rereview after insert on public.experience_images
  for each row execute function app_private.images_require_rereview();

-- A verified provider cannot rename their business without an administrator.
create or replace function app_private.provider_name_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_name is distinct from old.business_name
     and old.verification_status in ('verified', 'suspended')
     and not app_private.is_admin()
     and auth.uid() is not null then
    raise exception 'HK_NAME_LOCKED: Contact support to change the name of a verified business.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger provider_profiles_name_guard before update on public.provider_profiles
  for each row execute function app_private.provider_name_guard();

revoke execute on function app_private.images_require_rereview() from public, anon;
grant execute on function app_private.images_require_rereview() to authenticated, service_role;
revoke execute on function app_private.provider_name_guard() from public, anon;
grant execute on function app_private.provider_name_guard() to authenticated, service_role;
