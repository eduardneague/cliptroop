import { createAdminClient } from "@/lib/supabase/admin";
import { DAYS, SpeedView, type SpeedRow } from "./speed-view";

/*
 * Developer → Speed (1.32.4): the last 7 days of real visitors' Web Vitals
 * (web_vitals_summary, migration 0110), shown by speed-view.tsx.
 */

const isMissing = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /web_vitals_summary/.test(e.message ?? "");

export async function SpeedTab() {
  const { data, error } = await createAdminClient().rpc("web_vitals_summary", { p_days: DAYS });
  if (error) return <SpeedView rows={[]} problem={{ missing: isMissing(error), message: error.message }} />;
  return <SpeedView rows={(data ?? []) as SpeedRow[]} />;
}
