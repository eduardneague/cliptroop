import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { getCachedUser } from "@/lib/supabase/get-user";
import { filtersToRpc, readFilters } from "@/modules/outliers/lib/filters";
import { FORMAT_BY_ID, FORMATS } from "@/modules/outliers/lib/formats";
import { forKind, toModel, type KindInsights } from "@/modules/outliers/lib/insights";
import { suggestKeywords } from "@/modules/outliers/lib/keywords";
import { hash } from "@/modules/outliers/lib/corpus";
import {
  accessStatus,
  crossInsights,
  getChannelDetail,
  getOverview,
  getSaved,
  getVideoDetail,
  ideasData,
  miniVideos,
  nicheInsights,
  ownTitles,
  readChannels,
  readVideos,
} from "@/modules/outliers/lib/queries";
import type { Kind, VideoPage } from "@/modules/outliers/lib/types";
import { PERIOD_DAYS, readChannelSort, readPeriod, readTab, type Period, type TabData } from "@/modules/outliers/lib/view";
import { OutliersView } from "@/modules/outliers/components/outliers-view";

export const metadata: Metadata = { title: "Outliers" };
// Adding a niche fills it in right away (the first searches run after the answer).
export const maxDuration = 60;

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY: VideoPage = { rows: [], total: 0 };

/**
 * Outliers (1.27.0): videos that did far better than their channel usually
 * does, in the team's niches and a little of everything else, with ideas,
 * formats, keywords, channels, titles and thumbnails worked out from them.
 */
export default async function OutliersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const teamId = currentTeam.id;
  const [membership, overview, user, access] = await Promise.all([getMembership(supabase, teamId), getOverview(teamId), getCachedUser(), accessStatus(supabase, teamId)]);
  if (!membership || !user) return <div className="p-8 text-sm text-ink-soft">You&rsquo;re not on this team.</div>;
  const roles = membership.roles;
  const isMaster = roles.includes("master");
  const canManage = isMaster || roles.includes("researcher");

  const tab = readTab(one(sp.tab));
  const kind: Kind = one(sp.kind) === "short" ? "short" : "long";
  const all = [...overview.niches, ...overview.explore];
  const asked = one(sp.niche);
  // The team's first niche by default; "all": every niche; an explore niche by its id.
  const nicheId = asked === "all" ? null : asked && all.some((n) => n.id === asked) ? asked : overview.niches[0]?.id ?? null;

  // A niche's numbers for this kind (every niche together when none is picked), once per request.
  const insights = cache(async (): Promise<KindInsights | null> => (nicheId ? forKind(await nicheInsights(supabase, nicheId), kind) : crossInsights(supabase, teamId, kind, null)));

  const v = one(sp.v);
  const c = one(sp.c);
  const seed = (Math.floor(Date.now() / 86_400_000) * 2654435761 + hash(`${nicheId ?? "all"}|${kind}`)) >>> 0;
  const year = new Date().getUTCFullYear();

  const loadTab = async (): Promise<TabData> => {
    switch (tab) {
      case "search": {
        // The kind is the page's own (the switch at the top), not a filter.
        const f = readFilters(sp);
        delete f.kind;
        const sort = f.sort ?? "score";
        const [page, ins] = await Promise.all([readVideos(supabase, teamId, f.scope === "all" ? null : nicheId, filtersToRpc({ ...f, kind }), sort, 48), insights()]);
        const counts = new Map((ins?.formats ?? []).map((x) => [x.id, x.n]));
        return {
          tab,
          page,
          filters: f,
          sort,
          formatCounts: FORMATS.map((x) => ({ id: x.id, n: counts.get(x.id) ?? 0 })),
          langs: ins?.langs ?? [],
        };
      }
      case "ideas": {
        const lock = one(sp.lock);
        const topic = one(sp.topic)?.trim().slice(0, 60) || null;
        return { tab, ideas: await ideasData(teamId, user.id, nicheId, kind), lockFormat: lock && FORMAT_BY_ID.has(lock) ? lock : null, lockTopic: topic, seed, year };
      }
      case "formats": {
        const [local, cross] = await Promise.all([insights(), crossInsights(supabase, teamId, kind, nicheId)]);
        const ids = [...(local?.formats ?? []).flatMap((x) => x.ex.slice(0, 2)), ...(cross?.formats ?? []).flatMap((x) => x.ex.slice(0, 2)), ...(local?.templates ?? []).slice(0, 24).flatMap((t) => t.ex.slice(0, 3))];
        const fmt = one(sp.fmt);
        return {
          tab,
          local: local?.formats ?? [],
          cross: cross?.formats ?? [],
          templates: local?.templates ?? [],
          examples: await miniVideos(supabase, ids),
          n: local?.n ?? 0,
          selected: fmt && FORMAT_BY_ID.has(fmt) ? fmt : null,
        };
      }
      case "keywords": {
        const ins = await insights();
        const keywords = ins?.keywords ?? [];
        return { tab, keywords, examples: await miniVideos(supabase, keywords.slice(0, 120).flatMap((k) => k.ex.slice(0, 2))), n: ins?.n ?? 0, selected: one(sp.kw)?.slice(0, 60) ?? null };
      }
      case "channels": {
        const sort = readChannelSort(one(sp.csort));
        const q = (one(sp.cq) ?? "").trim().slice(0, 80);
        const onlyRaw = one(sp.only);
        const only = onlyRaw === "tracked" || onlyRaw === "hidden" ? onlyRaw : "all";
        const r = await readChannels(supabase, teamId, nicheId, { ...(q ? { q } : {}), ...(only === "tracked" ? { tracked: true } : {}), ...(only === "hidden" ? { hidden: true } : {}) }, sort, 60, 0);
        return { tab, rows: r.rows, total: r.total, sort, q, only };
      }
      case "titles": {
        const [local, cross] = await Promise.all([insights(), crossInsights(supabase, teamId, kind, nicheId)]);
        return { tab, local: toModel(local), cross: cross ? { formats: cross.formats, numbers: cross.numbers } : null, title: (one(sp.t) ?? "").slice(0, 120), compare: [] };
      }
      case "thumbnails": {
        const p = one(sp.period);
        const period: Period = p === "week" || p === "month" ? p : "year";
        const [page, ins] = await Promise.all([readVideos(supabase, teamId, nicheId, { kind, min_score: 2, days: PERIOD_DAYS[period] }, "score", 120), insights()]);
        return { tab, rows: page.rows, colors: ins?.colors ?? null, period };
      }
      case "saved": {
        const folder = one(sp.folder);
        const f = folder === "unsorted" || (folder && UUID.test(folder)) ? folder : null;
        return { tab, items: await getSaved(teamId, f), folder: f };
      }
      default: {
        const period = readPeriod(one(sp.period));
        const days = PERIOD_DAYS[period];
        const [best, rising, small, tracked, ins] = await Promise.all([
          readVideos(supabase, teamId, nicheId, { kind, days, min_score: 1.5 }, "score", kind === "short" ? 18 : 12),
          readVideos(supabase, teamId, nicheId, { kind, days: 4 }, "projected", 10),
          readVideos(supabase, teamId, nicheId, { kind, days: 120, max_subs: 100_000, min_score: 4 }, "score", 6),
          overview.tracked.length ? readVideos(supabase, teamId, null, { kind, scope: "tracked", days: 30 }, "newest", kind === "short" ? 14 : 10) : Promise.resolve(EMPTY),
          insights(),
        ]);
        return {
          tab: "home",
          period,
          best,
          // Only the ones already beating their channel (or heading there).
          rising: rising.rows.filter((x) => (x.projected ?? x.score ?? 0) >= 1.5),
          small: small.rows,
          tracked: tracked.rows,
          formats: (ins?.formats ?? []).filter((x) => x.n >= 3).slice(0, 8),
          // What titles are about first (the niche's topics), then the rest.
          keywords: (() => {
            const topical = new Set((ins?.topics ?? []).map((t) => t.key));
            const list = (ins?.keywords ?? []).filter((k) => !k.place && (k.shape ?? 0) < 0.7);
            return [...list.filter((k) => topical.has(k.key)), ...list.filter((k) => !topical.has(k.key))].slice(0, 20);
          })(),
          examples: {},
          // Streamed after the page: the ideas need the most reading.
          ideas: ideasData(teamId, user.id, nicheId, kind),
          seed,
          year,
        };
      }
    }
  };

  const [data, initialVideo, initialChannel, suggest] = await Promise.all([
    loadTab(),
    v && VIDEO.test(v) ? getVideoDetail(teamId, v) : Promise.resolve(null),
    !v && c && CHANNEL.test(c) ? getChannelDetail(teamId, c) : Promise.resolve(null),
    canManage ? ownTitles(supabase, teamId).then((t) => suggestKeywords(t)) : Promise.resolve([]),
  ]);

  return (
    <OutliersView
      teamId={teamId}
      teamName={currentTeam.name}
      niches={overview.niches}
      explore={overview.explore}
      nicheId={nicheId}
      kind={kind}
      canManage={canManage}
      isMaster={isMaster}
      folders={overview.folders}
      tracked={overview.tracked}
      saves={overview.saves}
      saved={overview.saved}
      settings={overview.settings}
      access={access}
      suggest={suggest}
      initialVideoId={v && VIDEO.test(v) ? v : null}
      initialVideo={initialVideo}
      initialChannelId={!v && c && CHANNEL.test(c) ? c : null}
      initialChannel={initialChannel}
      data={data}
    />
  );
}
