import { getCurrentUser } from "@/lib/auth";
import { nairobiDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Personal data export for the signed-in user (DPA 2019 right of access / portability). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return new Response("Export failed", { status: 500 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hidden-kenya-my-data-${nairobiDate()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
