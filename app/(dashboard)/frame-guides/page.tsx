import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { loadFrameLibrary } from "@/modules/frames/lib/queries";
import { FrameGuidesApp } from "@/modules/frames/components/frame-guides-app";

export const metadata: Metadata = { title: "Frame Guides" };

/**
 * Frame Guides (1.54.0): the team's collections of guide frames (references for how a shot should look), found fast
 * and used in any script. ?c=<collection> opens on a collection, ?frame=<id> on a frame (a script's link to it).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string; frame?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const library = await loadFrameLibrary(currentTeam.id, supabase);
  return <FrameGuidesApp initial={library} teamName={currentTeam.name} initialCollection={sp.c ?? null} initialFrame={sp.frame ?? null} />;
}
