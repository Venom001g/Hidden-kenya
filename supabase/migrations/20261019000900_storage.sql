-- Hidden Kenya: storage buckets and object policies.
--
-- experience-media        public read. Path: {provider_id}/{experience_id}/{uuid}.{ext}
-- destination-media       public read, admin write. Path: {destination_id}/{uuid}.{ext}
-- verification-documents  PRIVATE. Path: {provider_id}/{uuid}.{ext}
--                         Read by the owning provider and admins only; admins view
--                         through short-lived signed URLs issued by server code.
--
-- Bucket size and MIME limits are enforced by Storage; the application additionally
-- checks file signatures (magic bytes) before uploading.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('experience-media', 'experience-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('destination-media', 'destination-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-documents', 'verification-documents', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return p_text::uuid;
  end if;
  return null;
end;
$$;
grant execute on function app_private.try_uuid(text) to anon, authenticated, service_role;

-- experience-media
create policy "experience_media_provider_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'experience-media'
    and (storage.foldername(name))[1] = (select app_private.my_provider_id())::text
    and app_private.owns_experience(app_private.try_uuid((storage.foldername(name))[2]))
  );
create policy "experience_media_provider_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'experience-media'
    and (storage.foldername(name))[1] = (select app_private.my_provider_id())::text
  );
create policy "experience_media_provider_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'experience-media'
    and (storage.foldername(name))[1] = (select app_private.my_provider_id())::text
  );

-- destination-media
create policy "destination_media_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'destination-media' and (select app_private.is_admin()));
create policy "destination_media_admin_select" on storage.objects for select to authenticated
  using (bucket_id = 'destination-media' and (select app_private.is_admin()));
create policy "destination_media_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'destination-media' and (select app_private.is_admin()));

-- verification-documents (private)
create policy "verification_docs_owner_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select app_private.my_provider_id())::text
  );
create policy "verification_docs_owner_or_admin_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and (
      (storage.foldername(name))[1] = (select app_private.my_provider_id())::text
      or (select app_private.is_admin())
    )
  );
create policy "verification_docs_owner_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select app_private.my_provider_id())::text
  );
