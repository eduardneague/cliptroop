"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * "Test the timer": Supabase calls this site right now, exactly like the
 * every-minute timer does. The answer shows up in Health a few seconds later.
 */
export async function testTimer(teamId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("posting_ping", { p_team: teamId });
  if (error) return { error: error.code === "42501" ? "Only the master or a scheduler can test the timer." : "Couldn't start the test." };
  if (!data) return { error: "The timer doesn't know where to call yet: add posting_url and cron_secret to Supabase Vault." };
  // pg_net sends the call in the background; give it a moment to answer.
  await new Promise((r) => setTimeout(r, 4000));
  revalidatePath("/posting");
  return {};
}
