"use client";

import { useEffect, useRef, useState } from "react";
import { useLatest } from "@/lib/hooks/use-scroll-lock";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { createNiche, deleteNiche, loadChannels, updateNiche } from "@/app/(dashboard)/outliers/actions";
import { EXPLORE, NICHE_COLORS, nicheColor } from "../lib/explore";
import { langName, NICHE_LANGS, presetOf, REGION_PRESETS, type RegionPreset } from "../lib/regions";
import type { Kind, NicheInfo } from "../lib/types";
import { BTN, BTN_MAIN, ChannelAvatar, FIELD, LABEL, Toggle } from "./bits";
import { ChannelFinder, type FoundChannel } from "./channel-finder";
import { ChipsInput } from "./chips-input";
import { useOutliers } from "./context";
import { nicheChannels } from "./detail-cache";

/*
 * Adding or changing a niche (1.27.0, 1.29.0): the channels it's about (they
 * always count; "Only videos from these channels" leaves everything else
 * out), the words people search for its videos (ClipTroop searches them and
 * keeps the channels that fit), words to leave out, and who its creators
 * are: the language they speak (like your own channel by default), where
 * they're from, and whether made-for-kids videos count. An explore niche
 * becomes the team's own with "Use as my niche": its channels and keywords
 * to start from.
 *
 * 1.30.1: its channels show as placeholders while they load (as many as it
 * has), straight away the next time it's opened (then checked again: what
 * you take out or add meanwhile stays), and a search box finds one among
 * them all.
 */

type Picked = { id: string; title: string; avatar: string | null };
type LangMode = "team" | "any" | "pick";

/** Placeholder chips' widths (they look like names of different lengths). */
const SKELETON_W = [128, 96, 150, 112, 84, 138, 104, 160, 92, 120, 144, 100];

/** A niche's own channels, all of them (60 at a time). */
async function ownChannels(teamId: string, nicheId: string): Promise<Picked[] | null> {
  const out: Picked[] = [];
  for (let offset = 0; offset < 240; offset += 60) {
    const r = await loadChannels(teamId, nicheId, { only: "group" }, "subs", offset);
    if (r.error !== undefined) return null;
    out.push(...r.rows.map((c) => ({ id: c.id, title: c.title, avatar: c.avatar })));
    if (out.length >= r.total || !r.rows.length) break;
  }
  return out;
}

export function NicheDialog({
  teamId,
  open,
  onClose,
  niche,
  suggestions = [],
  kind = "long",
  teamLang = null,
}: {
  teamId: string;
  open: boolean;
  onClose: () => void;
  /** null: a new niche; an explore niche: a copy of it ("Use as my niche"). */
  niche: NicheInfo | null;
  suggestions?: string[];
  kind?: Kind;
  teamLang?: string | null;
}) {
  const ctx = useOutliers();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = !!niche && !niche.explore;
  const copying = !!niche?.explore;
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [color, setColor] = useState<string>("blue");
  const [kinds, setKinds] = useState<Kind[]>(["long", "short"]);
  const [langMode, setLangMode] = useState<LangMode>("team");
  const [langs, setLangs] = useState<string[]>([]);
  const [preset, setPreset] = useState<RegionPreset["id"]>("anywhere");
  const [customRegions, setCustomRegions] = useState<string[]>([]);
  const [kids, setKids] = useState(false);
  const [onlyGroup, setOnlyGroup] = useState(false);
  const [channels, setChannels] = useState<Picked[]>([]);
  // null: still loading the niche's channels (or they couldn't be read: then they're left as they are).
  const [loaded, setLoaded] = useState<boolean | null>(true);
  // How many are on their way (the placeholders while they load).
  const [expected, setExpected] = useState(0);
  // What was taken out or added while they were still being read (kept when the fresh list lands).
  const edits = useRef<{ out: Set<string>; added: Picked[] }>({ out: new Set(), added: [] });
  const [find, setFind] = useState("");
  const [all, setAll] = useState(false);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the dialog opened with: read once per opening (the page refreshing behind it doesn't reset the form).
  const props = useLatest({ niche, teamLang });

  useEffect(() => {
    if (!open) return;
    const { niche, teamLang } = props.current;
    const editing = !!niche && !niche.explore;
    const copying = !!niche?.explore;
    setError(null);
    setFinding(false);
    setFind("");
    setAll(false);
    edits.current = { out: new Set(), added: [] };
    let live = true;
    const loadFrom = (id: string, n: number) => {
      setLoaded(null);
      setExpected(n);
      // Seen before: those at once (they're read again below; saving waits for that).
      const seen = nicheChannels.get(id);
      if (seen) setChannels(seen);
      ownChannels(teamId, id)
        .then((list) => {
          if (!live) return;
          if (list) {
            nicheChannels.set(id, list);
            const { out, added } = edits.current;
            setChannels([...list.filter((c) => !out.has(c.id)), ...added.filter((a) => !list.some((c) => c.id === a.id))]);
          }
          setLoaded(!!list);
        })
        .catch(() => live && setLoaded(false));
    };
    if (editing && niche) {
      setName(niche.name);
      setKeywords(niche.keywords);
      setExclude(niche.excludeWords);
      setColor(niche.color);
      setKinds(niche.kinds.length ? niche.kinds : ["long", "short"]);
      setLangMode(niche.langs === null ? "team" : niche.langs.length ? "pick" : "any");
      setLangs(niche.langs ?? []);
      const p = presetOf(niche.regions);
      setPreset(p);
      setCustomRegions(p === "custom" ? niche.regions : []);
      setKids(niche.kids);
      setOnlyGroup(niche.onlyGroup);
      setChannels([]);
      if (niche.groupN > 0) loadFrom(niche.id, niche.groupN);
      else setLoaded(true);
    } else {
      // A copy of an explore niche: its channels and words to start from, in English like it.
      const ex = copying && niche ? EXPLORE.find((e) => e.slug === niche.slug) : null;
      setName(copying && niche ? niche.name : "");
      setKeywords(ex?.keywords ?? []);
      setExclude([]);
      setColor(copying && niche ? niche.color : NICHE_COLORS[Math.floor(Math.random() * 8)]);
      setKinds(["long", "short"]);
      setLangMode(copying ? "pick" : "team");
      setLangs(copying ? ["en"] : []);
      // English-speaking teams (or not known yet): creators from the US, Canada, the UK and Europe to start with.
      setPreset(!teamLang || teamLang === "en" ? "us-europe" : "anywhere");
      setCustomRegions([]);
      setKids(false);
      setOnlyGroup(false);
      setChannels([]);
      if (copying && niche) loadFrom(niche.id, niche.groupN);
      else setLoaded(true);
    }
    return () => {
      live = false;
    };
    // Once per opening, per niche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, niche?.id, teamId]);

  const startFrom = (slug: string) => {
    const p = EXPLORE.find((e) => e.slug === slug);
    if (!p) return;
    setName((n) => n || p.name);
    setKeywords((k) => [...new Set([...k, ...p.keywords])].slice(0, 12));
    setColor(p.color);
    // Its well-known channels too (the explore niche's own).
    const ex = ctx.explore.find((e) => e.slug === slug);
    if (ex && ex.groupN > 0) {
      setLoaded(null);
      setExpected(ex.groupN);
      ownChannels(teamId, ex.id)
        .then((list) => {
          if (list) setChannels((old) => [...old, ...list.filter((c) => !old.some((o) => o.id === c.id))].slice(0, 200));
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  };
  const pick = (c: FoundChannel) => {
    const e = edits.current;
    if (channels.some((o) => o.id === c.id)) {
      e.out.add(c.id);
      e.added = e.added.filter((a) => a.id !== c.id);
    } else {
      e.out.delete(c.id);
      e.added = [...e.added, { id: c.id, title: c.title, avatar: c.avatar }];
    }
    setChannels((old) => (old.some((o) => o.id === c.id) ? old.filter((o) => o.id !== c.id) : [...old, { id: c.id, title: c.title, avatar: c.avatar }].slice(0, 200)));
  };
  const drop = (id: string) => {
    edits.current.out.add(id);
    edits.current.added = edits.current.added.filter((a) => a.id !== id);
    setChannels((old) => old.filter((o) => o.id !== id));
  };

  const regions = preset === "custom" ? customRegions : REGION_PRESETS.find((p) => p.id === preset)?.regions ?? [];
  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Give the niche a name.");
    if (!keywords.length && !channels.length) return setError("Add a few channels or keywords: what the niche is about.");
    if (onlyGroup && !channels.length && loaded !== null) return setError("Pick at least one channel, or turn off “Only videos from these channels”.");
    if (langMode === "pick" && !langs.length) return setError("Pick at least one language, or choose Any language.");
    setBusy(true);
    const chosenLangs = langMode === "team" ? null : langMode === "any" ? [] : langs;
    const input = {
      name,
      keywords,
      excludeWords: exclude,
      color,
      kinds,
      langs: chosenLangs,
      lang: chosenLangs === null ? teamLang : null,
      // YouTube is searched from the US when creators should be from the US and Europe (or English-speaking countries).
      region: regions.length ? (editing && niche?.region ? niche.region : "US") : editing ? niche?.region ?? null : null,
      regions,
      kids,
      onlyGroup,
      // The niche's own channels become exactly these (left as they are when they couldn't be read).
      ...(loaded ? { channels: channels.map((c) => c.id) } : {}),
    };
    try {
      if (editing && niche) {
        const r = await updateNiche(teamId, niche.id, input);
        if (r.error !== undefined) return setError(r.error);
        if (loaded) nicheChannels.set(niche.id, channels);
        toast.success("Niche saved. Its channels are checked again now.");
        onClose();
      } else {
        const r = await createNiche(teamId, input);
        if (r.error !== undefined) return setError(r.error);
        toast.success("Niche added. The first videos arrive within a few minutes.");
        onClose();
        const href = `/outliers?niche=${r.id}${kind === "short" ? "&kind=short" : ""}`;
        startNavProgress(href);
        router.push(href);
      }
    } catch {
      setError("Couldn't save the niche. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !niche) return;
    const ok = await confirm({ title: `Remove “${niche.name}”?`, description: "Its keywords and channel list go. Saved videos and ideas stay in Saved.", confirmLabel: "Remove niche", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await deleteNiche(teamId, niche.id);
      if (r.error !== undefined) return toast.error(r.error);
      toast.success("Niche removed");
      onClose();
      startNavProgress("/outliers");
      router.push("/outliers");
    } catch {
      toast.error("Couldn't remove the niche. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const presets = editing || copying ? [] : EXPLORE.slice(0, 24);
  const toggleKind = (k: Kind) => setKinds((ks) => (ks.includes(k) ? (ks.length > 1 ? ks.filter((x) => x !== k) : ks) : [...ks, k]));
  const toggleLang = (l: string) => setLangs((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l].slice(0, 8)));
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-[13px] font-semibold transition-colors ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`;
  // The channels shown: what the search box finds (all of them), or the first 40 (or all, when asked).
  const q = find.trim().toLowerCase();
  const matches = q ? channels.filter((c) => (c.title || "").toLowerCase().includes(q)) : channels;
  const shown = q || all ? matches : matches.slice(0, 40);
  const skeletons = loaded === null && !channels.length ? Math.max(1, Math.min(expected || 8, 24)) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Change ${niche?.name}` : copying ? `Use ${niche?.name} as your niche` : "Add a niche"}
      description={editing ? undefined : copying ? "A copy for your team, with the same channels and keywords to start from. Change anything." : "What it's about: the channels you watch and the words people search. ClipTroop finds more channels that fit and keeps their videos up to date."}
      width="sm:max-w-2xl"
      footer={
        <>
          {editing && (
            <button type="button" onClick={remove} disabled={busy} className={`${BTN} mr-auto text-red hover:text-red`}>
              Remove
            </button>
          )}
          <button type="button" onClick={onClose} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy} className={BTN_MAIN}>
            {busy ? "Saving…" : editing ? "Save niche" : "Add niche"}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {presets.length > 0 && (
          <div>
            <span className={LABEL}>Start from (optional)</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button key={p.slug} type="button" onClick={() => startFrom(p.slug)} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/35">
                  <span className="w-2 h-2 rounded-[2px]" style={{ background: nicheColor(p.color) }} aria-hidden />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="block">
          <span className={LABEL}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Tech reviews" className={FIELD} data-autofocus />
        </label>

        <section className="rounded-2xl border border-line/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">
                Channels it&rsquo;s about
                {(channels.length > 0 || skeletons > 0) && <span className="ml-1.5 text-ink-faint tabular-nums">{channels.length || expected}</span>}
              </p>
              <p className="text-[12px] text-ink-soft">They always count. The best way to tell ClipTroop what you mean.</p>
            </div>
            {!finding && (
              <button type="button" onClick={() => setFinding(true)} className={`${BTN} flex-shrink-0 text-ink`}>
                <PlusIcon className="w-4 h-4" />
                Add channels
              </button>
            )}
          </div>
          {loaded === false && <p className="text-[12.5px] text-ink-faint">Its channels couldn&rsquo;t be loaded, so they stay as they are.</p>}
          {skeletons > 0 && (
            // As many placeholders as it has channels (up to 24), until they're read.
            <ul className="flex flex-wrap gap-1.5" aria-busy="true" aria-label="Loading its channels">
              {Array.from({ length: skeletons }, (_, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 pl-1 pr-2 h-8">
                  <span className="skeleton w-[22px] h-[22px] rounded-full" />
                  <span className="skeleton h-2.5 rounded-full" style={{ width: SKELETON_W[i % SKELETON_W.length] - 40 }} />
                </li>
              ))}
            </ul>
          )}
          {channels.length > 12 && (
            <label className="relative block">
              <span className="sr-only">Find one of its channels</span>
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                onKeyDown={(e) => {
                  // Clears the box, not the whole window.
                  if (e.key === "Escape" && find) {
                    e.preventDefault();
                    e.stopPropagation();
                    setFind("");
                  }
                }}
                placeholder={`Find one of its ${channels.length} channels`}
                className="w-full rounded-lg border border-line/15 bg-surface pl-9 pr-9 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber"
                autoComplete="off"
                spellCheck={false}
              />
              {find && (
                <button type="button" onClick={() => setFind("")} aria-label="Clear the search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </label>
          )}
          {shown.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 animate-[fadein_.2s_ease]">
              {shown.map((c) => (
                <li key={c.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 pl-1 pr-1 h-8 text-[12.5px] font-semibold">
                  <ChannelAvatar src={c.avatar} title={c.title || "?"} size={22} />
                  <span className="max-w-[10rem] truncate">{c.title || "A channel"}</span>
                  <button type="button" onClick={() => drop(c.id)} aria-label={`Leave out ${c.title}`} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface">
                    <CloseIcon className="w-3 h-3" />
                  </button>
                </li>
              ))}
              {!q && !all && matches.length > shown.length && (
                <li>
                  <button type="button" onClick={() => setAll(true)} className="inline-flex items-center h-8 px-2.5 rounded-lg text-[12.5px] font-semibold text-amber hover:bg-amber/10">
                    Show all {matches.length}
                  </button>
                </li>
              )}
            </ul>
          )}
          {q && !matches.length && <p className="text-[12.5px] text-ink-faint">None of its channels is called &ldquo;{find.trim()}&rdquo;.</p>}
          {finding && (
            <div className="rounded-xl bg-surface-2/50 p-3">
              <ChannelFinder picked={new Set(channels.map((c) => c.id))} onPick={pick} autoFocus />
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setFinding(false)} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                  Done
                </button>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3 pt-1">
            <Toggle on={onlyGroup} onChange={setOnlyGroup} label="Only videos from these channels" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">Only videos from these channels</p>
              <p className="text-[12px] text-ink-soft">{onlyGroup ? "Nothing found by keywords counts. Keywords still name its ideas and formats." : "Off: channels found by the keywords count too, when they fit."}</p>
            </div>
          </div>
        </section>

        <div>
          <span className={LABEL}>
            Keywords ({keywords.length}/12){channels.length > 0 ? ", optional with channels" : ""}
          </span>
          <ChipsInput value={keywords} onChange={setKeywords} max={12} placeholder="phone review, gadgets, iphone…" suggestions={suggestions} ariaLabel="Keywords" />
          <p className="mt-1.5 text-[11.5px] text-ink-faint">What you&rsquo;d type in YouTube&rsquo;s search to find videos like yours. Short and specific works best.</p>
        </div>
        <div>
          <span className={LABEL}>Leave out videos with these words (optional)</span>
          <ChipsInput value={exclude} onChange={setExclude} max={30} maxLength={40} placeholder="asmr, live, podcast…" ariaLabel="Words to leave out" tone="red" />
        </div>

        <section className="space-y-4">
          <div>
            <span className={LABEL}>The language its creators speak</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Language">
              <button type="button" role="radio" aria-checked={langMode === "team"} onClick={() => setLangMode("team")} className={chip(langMode === "team")}>
                {langMode === "team" && <CheckIcon className="w-3.5 h-3.5 text-amber" />}
                Like your channel{teamLang ? ` (${langName(teamLang)})` : ""}
              </button>
              <button type="button" role="radio" aria-checked={langMode === "pick"} onClick={() => setLangMode("pick")} className={chip(langMode === "pick")}>
                {langMode === "pick" && <CheckIcon className="w-3.5 h-3.5 text-amber" />}
                {langMode === "pick" && langs.length ? langs.map(langName).join(", ") : "Pick"}
              </button>
              <button type="button" role="radio" aria-checked={langMode === "any"} onClick={() => setLangMode("any")} className={chip(langMode === "any")}>
                {langMode === "any" && <CheckIcon className="w-3.5 h-3.5 text-amber" />}
                Any language
              </button>
            </div>
            {langMode === "pick" && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {NICHE_LANGS.map((l) => {
                  const on = langs.includes(l);
                  return (
                    <button key={l} type="button" aria-pressed={on} onClick={() => toggleLang(l)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-[12.5px] font-semibold ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}>
                      {on && <CheckIcon className="w-3 h-3 text-amber" />}
                      {langName(l)}
                    </button>
                  );
                })}
              </div>
            )}
            {langMode === "team" && !teamLang && <p className="mt-1.5 text-[11.5px] text-ink-faint">Worked out from your own titles. Until it&rsquo;s known, any language counts.</p>}
          </div>
          <div>
            <span className={LABEL}>Where its creators are from</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Where its creators are from">
              {[...REGION_PRESETS, ...(preset === "custom" ? [{ id: "custom" as const, label: `Your own list (${customRegions.length} countries)`, regions: customRegions }] : [])].map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => setPreset(p.id)} className={chip(preset === p.id)}>
                  {preset === p.id && <CheckIcon className="w-3.5 h-3.5 text-amber" />}
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-faint">A channel counts when it says it&rsquo;s from there or its videos show it (when it&rsquo;s not clear, it stays in). Your own channels always count.</p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[rgb(var(--amber))]" />
            <span>
              <span className="block text-[13px] font-semibold">Videos made for kids count</span>
              <span className="block text-[12px] text-ink-soft">Off: nursery rhymes, toddler shows and other made-for-kids videos never show here.</span>
            </span>
          </label>
        </section>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className={LABEL}>Videos</span>
            <div className="flex gap-1.5">
              {(["long", "short"] as const).map((k) => {
                const on = kinds.includes(k);
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => toggleKind(k)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 h-10 text-[13px] font-semibold ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}>
                    {on && <CheckIcon className="w-3.5 h-3.5 text-amber" />}
                    {k === "long" ? "Long videos" : "Shorts"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className={LABEL}>Colour</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
              {NICHE_COLORS.slice(0, 16).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-lg ring-offset-2 ring-offset-surface ${color === c ? "ring-2 ring-ink" : ""}`} style={{ background: nicheColor(c) }} />
              ))}
            </div>
          </div>
        </div>
        {error && (
          <p className="rounded-lg bg-red/10 text-red px-3 py-2 text-[12.5px] font-semibold" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
