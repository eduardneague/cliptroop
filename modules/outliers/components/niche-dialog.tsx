"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { CheckIcon } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { startNavProgress } from "@/components/ui/nav-progress";
import { createNiche, deleteNiche, updateNiche } from "@/app/(dashboard)/outliers/actions";
import { EXPLORE, NICHE_COLORS, nicheColor } from "../lib/explore";
import type { Kind, NicheInfo } from "../lib/types";
import { BTN, BTN_MAIN, FIELD, LABEL } from "./bits";
import { ChipsInput } from "./chips-input";

/*
 * Adding or changing a niche (1.27.0): a name, the words people search for
 * its videos (what the collector searches YouTube for), words to leave out,
 * a colour, long videos and/or Shorts, and optionally a language and a
 * country. New niches fill in within a minute or two.
 */

const LANGS: [string, string][] = [
  ["en", "English"],
  ["ro", "Romanian"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["de", "German"],
  ["fr", "French"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["tr", "Turkish"],
  ["ru", "Russian"],
  ["hi", "Hindi"],
  ["id", "Indonesian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["ar", "Arabic"],
];
const REGIONS: [string, string][] = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["IN", "India"],
  ["RO", "Romania"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["NL", "Netherlands"],
  ["PL", "Poland"],
  ["TR", "Turkey"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
  ["JP", "Japan"],
  ["KR", "South Korea"],
  ["ID", "Indonesia"],
  ["PH", "Philippines"],
];

export function NicheDialog({ teamId, open, onClose, niche, suggestions = [], kind = "long" }: { teamId: string; open: boolean; onClose: () => void; niche: NicheInfo | null; suggestions?: string[]; kind?: Kind }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = !!niche && !niche.explore;
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [color, setColor] = useState<string>("blue");
  const [kinds, setKinds] = useState<Kind[]>(["long", "short"]);
  const [lang, setLang] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing && niche) {
      setName(niche.name);
      setKeywords(niche.keywords);
      setExclude(niche.excludeWords);
      setColor(niche.color);
      setKinds(niche.kinds.length ? niche.kinds : ["long", "short"]);
      setLang(niche.lang);
      setRegion(niche.region);
    } else {
      // Copying an explore niche ("Make it ours"): its words to start from.
      setName(niche?.explore ? niche.name : "");
      setKeywords(niche?.explore ? EXPLORE.find((e) => e.slug === niche.slug)?.keywords ?? [] : []);
      setExclude([]);
      setColor(niche?.explore ? niche.color : NICHE_COLORS[Math.floor(Math.random() * 8)]);
      setKinds(["long", "short"]);
      setLang(null);
      setRegion(null);
    }
  }, [open, editing, niche]);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Give the niche a name.");
    if (!keywords.length) return setError("Add at least one keyword: the words people would search for videos in this niche.");
    setBusy(true);
    const input = { name, keywords, excludeWords: exclude, color, lang, region, kinds };
    try {
      if (editing && niche) {
        const r = await updateNiche(teamId, niche.id, input);
        if (r.error !== undefined) return setError(r.error);
        toast.success("Niche saved. New keywords are searched now.");
        onClose();
      } else {
        const r = await createNiche(teamId, input);
        if (r.error !== undefined) return setError(r.error);
        toast.success("Niche added. The first videos arrive in a minute or two.");
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

  const presets = EXPLORE.filter((e) => !editing).slice(0, 24);
  const toggleKind = (k: Kind) => setKinds((ks) => (ks.includes(k) ? (ks.length > 1 ? ks.filter((x) => x !== k) : ks) : [...ks, k]));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Change ${niche?.name}` : "Add a niche"}
      description={editing ? undefined : "The words people search for its videos. ClipTroop finds the channels and keeps their videos up to date."}
      width="sm:max-w-xl"
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
      <div className="space-y-5">
        {!editing && !niche?.explore && (
          <div>
            <span className={LABEL}>Start from (optional)</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => {
                    setName((n) => n || p.name);
                    setKeywords((k) => [...new Set([...k, ...p.keywords])].slice(0, 12));
                    setColor(p.color);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/35"
                >
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
        <div>
          <span className={LABEL}>Keywords ({keywords.length}/12)</span>
          <ChipsInput value={keywords} onChange={setKeywords} max={12} placeholder="fake iphone, phone review, gadgets…" suggestions={suggestions} ariaLabel="Keywords" />
          <p className="mt-1.5 text-[11.5px] text-ink-faint">Short and specific works best: what you&rsquo;d type in YouTube&rsquo;s search to find videos like yours.</p>
        </div>
        <div>
          <span className={LABEL}>Leave out videos with these words (optional)</span>
          <ChipsInput value={exclude} onChange={setExclude} max={30} maxLength={40} placeholder="asmr, live, podcast…" ariaLabel="Words to leave out" tone="red" />
        </div>
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
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className={LABEL}>Language (optional)</span>
            <Select value={lang} onChange={setLang} emptyOption="Any language" options={LANGS.map(([v, l]) => ({ value: v, label: l }))} ariaLabel="Language" />
          </div>
          <div>
            <span className={LABEL}>Country searched from (optional)</span>
            <Select value={region} onChange={setRegion} emptyOption="Anywhere" options={REGIONS.map(([v, l]) => ({ value: v, label: l }))} ariaLabel="Country" searchable />
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
