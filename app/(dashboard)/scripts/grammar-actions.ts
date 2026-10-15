"use server";

import { createClient } from "@/lib/supabase/server";

/*
 * The team's dictionary (0087): words the spelling check accepts. Everyone
 * on the team adds to it; a word is removed by whoever added it or a master
 * (the database decides).
 */

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (m?: string) => /team_dictionary|does not exist|schema cache/i.test(m ?? "");

export async function addDictionaryWord(teamId: string, word: string): Promise<{ id: string; error?: undefined } | { error: string }> {
  const w = String(word ?? "").trim();
  if (!UUID_RX.test(teamId)) return { error: "Team not found." };
  if (!w || w.length > 48 || /\s/.test(w)) return { error: "Only single words go in the dictionary." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_dictionary").insert({ team_id: teamId, word: w }).select("id").single();
  if (data) return { id: data.id as string };
  if (error?.code === "23505") {
    // Already there (maybe with other capitals): that's fine.
    const { data: had } = await supabase.from("team_dictionary").select("id").eq("team_id", teamId).ilike("word", w.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
    if (had) return { id: had.id as string };
  }
  if (missing(error?.message)) return { error: "Run migration 0087 first." };
  if (/full/i.test(error?.message ?? "")) return { error: "The team's dictionary is full (5,000 words)." };
  return { error: "Couldn't add the word." };
}

export async function removeDictionaryWord(id: string): Promise<{ error?: string }> {
  if (!UUID_RX.test(id)) return { error: "Word not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_dictionary").delete().eq("id", id).select("id");
  if (error) return { error: missing(error.message) ? "Run migration 0087 first." : "Couldn't remove the word." };
  if (!data?.length) return { error: "Only whoever added a word, or a master, can remove it." };
  return {};
}
