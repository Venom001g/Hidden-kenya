/**
 * Grants the FIRST administrator role to an existing, email-confirmed account.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run admin:bootstrap -- you@example.com
 *
 * Run it from a trusted machine with the server-only secret key. It refuses to run once any
 * administrator exists; further admins are granted from Admin → Users. There is deliberately
 * no web route for this.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Usage: npm run admin:bootstrap -- <email of an existing account>");
  if (!url || !key) throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY in the environment.");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let userId: string | null = null;
  for (let page = 1; page <= 50 && !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) {
      if (!match.email_confirmed_at) throw new Error("That account has not confirmed its email address yet.");
      userId = match.id;
    }
    if (data.users.length < 200) break;
  }
  if (!userId) throw new Error(`No account found for ${email}. Sign up on the site first, then rerun.`);

  const { error } = await db.rpc("bootstrap_first_admin", { p_user_id: userId });
  if (error) throw new Error(error.message);
  console.log(`Granted administrator role to ${email}. Sign out and back in to see the Administration menu.`);
}

main().catch((e) => {
  console.error(`Bootstrap failed: ${(e as Error).message}`);
  process.exit(1);
});
