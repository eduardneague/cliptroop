"use client";

import { useEffect, useState, useTransition } from "react";
import { setPalette } from "@/app/(dashboard)/settings/actions";
import { useToast } from "./toast-provider";
import { CheckIcon } from "./icons";

/*
 * Colour themes. The CSS for each lives in globals.css (html[data-palette]);
 * this file is the list, the device sync and the picker in Settings.
 * The choice is saved on the account (profiles.palette, migration 0060) and
 * cached on the device (localStorage "vp-palette") so the right colours are
 * on screen before the page paints (see the script in app/layout.tsx).
 */

export const PALETTES = [
  { id: "clippy", name: "Clippy", note: "The original: bone paper, orange", light: { paper: "237 238 231", surface: "255 255 255", accent: "232 99 13" }, dark: { paper: "18 15 11", surface: "28 24 17", accent: "232 99 13" } },
  { id: "ocean", name: "Ocean", note: "Cool grey-blue, blue", light: { paper: "233 237 242", surface: "255 255 255", accent: "37 99 235" }, dark: { paper: "12 15 21", surface: "21 26 35", accent: "59 130 246" } },
  { id: "forest", name: "Forest", note: "Soft sage, green", light: { paper: "231 236 229", surface: "255 255 255", accent: "22 128 74" }, dark: { paper: "12 16 13", surface: "21 28 23", accent: "31 150 88" } },
  { id: "lagoon", name: "Lagoon", note: "Sea glass, teal", light: { paper: "229 237 236", surface: "255 255 255", accent: "13 124 128" }, dark: { paper: "10 16 17", surface: "19 28 29", accent: "20 150 150" } },
  { id: "grape", name: "Grape", note: "Lavender, violet", light: { paper: "236 233 243", surface: "255 255 255", accent: "109 64 214" }, dark: { paper: "15 13 22", surface: "26 23 36", accent: "139 102 240" } },
  { id: "berry", name: "Berry", note: "Blush, raspberry", light: { paper: "241 233 236", surface: "255 255 255", accent: "196 37 99" }, dark: { paper: "19 12 15", surface: "32 22 27", accent: "225 62 120" } },
  { id: "sand", name: "Sand", note: "Warm sand, burnt orange", light: { paper: "243 237 225", surface: "255 253 249", accent: "180 83 9" }, dark: { paper: "20 16 10", surface: "33 27 18", accent: "214 110 30" } },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];
export const isPalette = (v: unknown): v is PaletteId => typeof v === "string" && PALETTES.some((p) => p.id === v);

const KEY = "vp-palette";
function apply(id: PaletteId | null) {
  try {
    const root = document.documentElement;
    if (!id || id === "clippy") {
      delete root.dataset.palette;
      localStorage.removeItem(KEY);
    } else {
      root.dataset.palette = id;
      localStorage.setItem(KEY, id);
    }
  } catch {
    /* private mode: the attribute still applies for this visit */
  }
}

/** Keeps this device on the account's colour theme (set on another device, say). */
export function PaletteSync({ palette }: { palette: string | null }) {
  useEffect(() => apply(isPalette(palette) ? palette : null), [palette]);
  return null;
}

const rgb = (v: string) => `rgb(${v.split(" ").join(",")})`;

/** Settings → Preferences → Colours: a little preview of each theme, light and dark. */
export function PaletteChoice({ value }: { value: string | null }) {
  const [current, setCurrent] = useState<PaletteId>(isPalette(value) ? value : "clippy");
  const [pending, start] = useTransition();
  const toast = useToast();
  function choose(id: PaletteId) {
    if (id === current) return;
    const prev = current;
    setCurrent(id);
    apply(id);
    start(async () => {
      const res = await setPalette(id === "clippy" ? null : id);
      if (res?.error) {
        setCurrent(prev);
        apply(prev);
        toast.error(res.error);
      }
    });
  }
  return (
    <div role="radiogroup" aria-label="Colour theme" className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {PALETTES.map((p) => {
        const on = p.id === current;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={pending && !on}
            onClick={() => choose(p.id)}
            className={`group text-left rounded-xl border p-2 transition-all ${on ? "border-amber ring-2 ring-amber/30" : "border-line/15 hover:border-line/30 hover:-translate-y-0.5"}`}
          >
            {/* Light and dark side by side: paper, a card, the accent button. */}
            <span className="flex h-16 rounded-lg overflow-hidden border border-line/10" aria-hidden>
              {(["light", "dark"] as const).map((mode) => (
                <span key={mode} className="flex-1 p-2 flex flex-col gap-1.5" style={{ background: rgb(p[mode].paper) }}>
                  <span className="h-2 w-3/4 rounded-sm" style={{ background: rgb(p[mode].surface) }} />
                  <span className="h-2 w-1/2 rounded-sm" style={{ background: rgb(p[mode].surface) }} />
                  <span className="mt-auto h-3 w-9 rounded" style={{ background: rgb(p[mode].accent) }} />
                </span>
              ))}
            </span>
            <span className="mt-2 px-0.5 flex items-center gap-1.5">
              <span className="text-[13px] font-semibold flex-1 truncate">{p.name}</span>
              {on && <CheckIcon className="w-4 h-4 text-amber" />}
            </span>
            <span className="block px-0.5 text-[11.5px] text-ink-faint truncate">{p.note}</span>
          </button>
        );
      })}
    </div>
  );
}
