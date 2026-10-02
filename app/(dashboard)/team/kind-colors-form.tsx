"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTeamColors } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { DEFAULT_LONG_COLOR, DEFAULT_SHORT_COLOR } from "@/lib/kind-colors";

// No red: red is reserved for problems.
const SWATCHES = ["#EA580C", "#F59E0B", "#16A34A", "#0D9488", "#0EA5E9", "#2563EB", "#4F46E5", "#7C3AED", "#DB2777", "#64748B"];

function Picker({ label, value, onChange, kind }: { label: string; value: string; onChange: (v: string) => void; kind: "short" | "long" }) {
  const Icon = kind === "short" ? ShortsIcon : VideoIcon;
  return (
    <div className="space-y-2.5">
      <div className="text-[12px] font-semibold text-ink-soft">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Use ${c}`}
            aria-pressed={value.toUpperCase() === c}
            className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${value.toUpperCase() === c ? "ring-2 ring-offset-2 ring-offset-surface ring-ink" : ""}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative w-8 h-8 rounded-lg border border-dashed border-line/40 flex items-center justify-center cursor-pointer text-[15px] text-ink-soft hover:text-ink" title="Custom colour">
          +
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`Custom colour for ${label}`} />
        </label>
      </div>
      {/* Live preview */}
      <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13.5px] max-w-sm">
        <span style={{ color: value }} className="flex">
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <span className="font-mono text-ink-soft">#{kind === "short" ? 12 : 3}</span>
        <span className="font-semibold truncate">{kind === "short" ? "Why Restarting Fixes 99%" : "I Tested a $200 Fake iPhone"}</span>
        <span className="flex-1" />
        <span className="w-2 h-2 rounded-[3px]" style={{ background: value }} />
      </div>
    </div>
  );
}

/** Team → Colors: the colours for shorts and long videos, everywhere. */
export function KindColorsForm({ teamId, short, long }: { teamId: string; short: string; long: string }) {
  const [s, setS] = useState(short);
  const [l, setL] = useState(long);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = s.toUpperCase() !== short.toUpperCase() || l.toUpperCase() !== long.toUpperCase();
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Picker label="Shorts" value={s} onChange={setS} kind="short" />
        <Picker label="Long videos" value={l} onChange={setL} kind="long" />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await updateTeamColors(teamId, s, l);
              if ("error" in r && r.error) toast.error(r.error);
              else {
                toast.success("Colours updated everywhere");
                router.refresh();
              }
            })
          }
          className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px] disabled:opacity-45"
        >
          {pending ? "Saving…" : "Save colours"}
        </button>
        <button
          type="button"
          onClick={() => {
            setS(DEFAULT_SHORT_COLOR);
            setL(DEFAULT_LONG_COLOR);
          }}
          className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
