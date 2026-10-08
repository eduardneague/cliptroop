"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Clip's tour is finished or skipped: remember it on your profile so it
 * never starts again by itself (on any device). Only your own row: the
 * profiles update policy plus the column grant in 0069.
 */
export async function setTutorialDone(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("profiles").update({ tutorial_done_at: new Date().toISOString() }).eq("id", user.id);
  return { ok: !error };
}
