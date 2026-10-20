import type { SupabaseClient } from "@supabase/supabase-js";
import { FORMAT_BY_ID } from "./formats";

/*
 * A saved Outliers idea, ready to start a video from (1.27.0): New long
 * video and New short read it from ?idea=<save id> and fill in their form
 * (titles, type, theme, hook, notes). Only ideas of the team you're in.
 */

export type IdeaPrefill = {
  id: string;
  titles: string[];
  hook: string;
  type: "Hub" | "Help" | "Hero";
  topic: string;
  /** The format's name ("Fake vs real"). */
  format: string | null;
  niche: string | null;
  sources: { id: string; title: string }[];
  why: string[];
  /** Started before: the video it became. */
  started: { kind: "long" | "short"; id: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function loadIdeaPrefill(supabase: SupabaseClient, teamId: string, id: string | undefined | null): Promise<IdeaPrefill | null> {
  if (!id || !UUID.test(id)) return null;
  const { data } = await supabase.from("outlier_saves").select("id, idea, project_id, short_id").eq("id", id).eq("team_id", teamId).eq("kind", "idea").maybeSingle();
  const idea = (data?.idea ?? null) as Record<string, unknown> | null;
  if (!data || !idea) return null;
  const titles = (Array.isArray(idea.titles) ? idea.titles : []).map((t) => text(t, 100)).filter(Boolean).slice(0, 5);
  if (!titles.length) return null;
  const formatId = typeof idea.formatId === "string" ? idea.formatId : null;
  return {
    id: String(data.id),
    titles,
    hook: text(idea.hook, 600),
    type: idea.type === "Help" || idea.type === "Hero" ? idea.type : "Hub",
    topic: text(idea.topic, 80),
    format: formatId ? FORMAT_BY_ID.get(formatId)?.name ?? null : null,
    niche: text(idea.niche, 40) || null,
    sources: (Array.isArray(idea.sources) ? idea.sources : [])
      .map((s) => s as { id?: unknown; title?: unknown })
      .filter((s) => typeof s?.id === "string" && VIDEO.test(s.id))
      .slice(0, 3)
      .map((s) => ({ id: String(s.id), title: text(s.title, 200) })),
    why: (Array.isArray(idea.why) ? idea.why : []).map((w) => text(w, 200)).filter(Boolean).slice(0, 3),
    started: data.project_id ? { kind: "long", id: String(data.project_id) } : data.short_id ? { kind: "short", id: String(data.short_id) } : null,
  };
}

/** The idea's background for the video's notes: where it comes from and why it could work. */
export function ideaNotes(p: IdeaPrefill): string {
  const lines = [`From Outliers${p.format ? `: ${p.format}` : ""}${p.topic ? `, about ${p.topic}` : ""}.`];
  if (p.sources.length) {
    lines.push("", "Outliers it comes from:");
    for (const s of p.sources) lines.push(`- ${s.title || "A video"}: https://www.youtube.com/watch?v=${s.id}`);
  }
  if (p.why.length) {
    lines.push("", "Why it could work:");
    for (const w of p.why) lines.push(`- ${w}`);
  }
  return lines.join("\n").slice(0, 4000);
}
