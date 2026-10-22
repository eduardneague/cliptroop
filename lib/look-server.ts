import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readLook, type Look } from "./look";

/**
 * This person's glass look from their profile (1.28.0; the colours behind it
 * since 1.29.2). Each older database knows less: before 0096 there are no
 * colours (`washStored: false`, the device keeps its own), before 0093 only
 * "on" (0092), before 0092 nothing: null = not known, the device keeps its
 * own choice.
 */
export async function getLook(supabase: SupabaseClient, userId: string): Promise<Look | null> {
  const full = await supabase
    .from("profiles")
    .select("glass_ui, glass_style, glass_scope, glass_sidebar, glass_level, glass_wash, glass_wash_colors")
    .eq("id", userId)
    .maybeSingle();
  if (!full.error) return full.data ? readLook(full.data) : null;
  const mid = await supabase.from("profiles").select("glass_ui, glass_style, glass_scope, glass_sidebar, glass_level").eq("id", userId).maybeSingle();
  if (!mid.error) return mid.data ? { ...readLook(mid.data), washStored: false } : null;
  const old = await supabase.from("profiles").select("glass_ui").eq("id", userId).maybeSingle();
  if (old.error || !old.data) return null;
  return { ...readLook(old.data), washStored: false };
}
