# Supabase setup (production)

None of these steps has been carried out yet; they are the procedure.

## 1. Project

- Create a project on a paid plan for production (daily backups, no pausing). Choose the region with
  the lowest latency to Kenya that your plan allows.
- Project Settings → API: copy the URL, the **publishable** key and the **secret** key. If your
  project only has legacy keys, the anon and service_role keys work too.

## 2. Migrations

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push            # applies supabase/migrations in order
```

Check afterwards: Table Editor shows 47 rows in `counties`; Storage shows buckets
`experience-media`, `destination-media` (public) and `verification-documents` (private).
Run the Supabase **Security Advisor** and review anything it reports.

## 3. Authentication

- Authentication → Providers → Email: enable, **Confirm email on**. Minimum password length 10 (the
  app enforces this too). Enable leaked-password protection if your plan offers it.
- URL Configuration: Site URL `https://<your-domain>`. Redirect URLs: `https://<your-domain>/**`
  (and preview domains if you use them).
- Email templates: the default templates work. Links go through Supabase's verify endpoint and land on
  `/auth/confirm`, which also supports `token_hash` links if you customise templates:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (use `type=recovery` for the
  reset template).
- **SMTP:** Supabase's built-in mailer is heavily rate-limited and not for production. Authentication
  → SMTP Settings: host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender =
  an address on your verified domain.
- Rate limits: review Authentication → Rate Limits; the app applies its own limits as well.

## 4. Storage

Buckets and policies are created by the migrations. Do not make `verification-documents` public.
The app serves host documents to admins only through short-lived signed URLs.

## 5. First administrator

After you sign up and confirm your email:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> npm run admin:bootstrap -- you@yourdomain
```

It refuses to run if an administrator already exists. Further admins are added in Admin → Users.

## 6. Backups

See [operations.md](operations.md#backups-and-recovery).
