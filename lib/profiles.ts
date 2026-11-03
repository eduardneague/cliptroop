import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a profile page shows of anyone: never their email or settings. */
export type ProfileCard = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  teams_visible: boolean;
};

/** Escape LIKE wildcards so "/u/a%" can't match every username. */
function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * A profile by handle — a username (case-insensitive, exact) or an
 * account id. Cached per request so the page and its metadata share it.
 *
 * 1.31.14: through profile_card() (0107), because the profiles table itself
 * now shows you only your own, your teams' and your invites' people. The
 * card is anyone's, for anyone signed in. A database without 0107 answers
 * the old way.
 */
export const getProfileByHandle = cache(async (rawHandle: string): Promise<ProfileCard | null> => {
  let handle = rawHandle;
  try {
    handle = decodeURIComponent(rawHandle);
  } catch {
    /* already decoded / malformed — use as-is */
  }
  handle = handle.trim();
  if (!handle || handle.length > 100) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_card", { p_handle: handle });
  if (!error) return ((data ?? []) as ProfileCard[])[0] ?? null;
  if (error.code !== "PGRST202" && error.code !== "42883") return null;

  const query = supabase.from("profiles").select("id, username, full_name, bio, avatar_url, created_at, teams_visible");
  const old = UUID_RE.test(handle) ? await query.eq("id", handle).maybeSingle() : await query.ilike("username", escapeLike(handle)).maybeSingle();
  return (old.data as ProfileCard | null) ?? null;
});
