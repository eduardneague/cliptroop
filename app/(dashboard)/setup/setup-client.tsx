"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";

/** A value with a Copy button. `big` = a long text (an email's HTML): shown folded. */
export function CopyField({ label, value, big = false, hint }: { label: string; value: string; big?: boolean; hint?: React.ReactNode }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers / no permission: select-and-copy fallback.
      const t = document.createElement("textarea");
      t.value = value;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setDone(true);
    toast.success(`Copied: ${label}`, { sound: "tick" });
    setTimeout(() => setDone(false), 1600);
  }
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
        {hint ? <span className="text-[11.5px] text-ink-faint">{hint}</span> : null}
      </div>
      <div className="flex items-stretch gap-2">
        {big ? (
          <span className="flex-1 min-w-0 rounded-lg border border-line/15 bg-paper/60 px-3 py-2 text-[12.5px] text-ink-soft">
            {value.length.toLocaleString()} characters of HTML. Press Copy, then paste it in Supabase.
          </span>
        ) : (
          <code className="flex-1 min-w-0 rounded-lg border border-line/15 bg-paper/60 px-3 py-2 font-mono text-[12.5px] break-all whitespace-pre-wrap select-all">{value}</code>
        )}
        <button
          type="button"
          onClick={copy}
          className={`flex-shrink-0 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${done ? "bg-green text-white" : "bg-amber text-white hover:brightness-110"}`}
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** What the email looks like (Supabase's {{ }} parts filled with examples), in light or dark mode. */
export function EmailPreview({ html, origin }: { html: string; origin: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const doc = html
    .replace(/\{\{ \.SiteURL \}\}/g, origin)
    .replace(/\{\{ \.TokenHash \}\}/g, "example")
    .replace(/\{\{ \.NewEmail \}\}/g, "new@example.com")
    .replace(/\{\{ \.Email \}\}/g, "alex@example.com")
    // Show one version whatever this browser prefers: dark rules always on, or never.
    .replace(/@media \(prefers-color-scheme: dark\)/g, mode === "dark" ? "@media all" : "@media (max-width: 0px)");
  const tab = (m: "light" | "dark", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`rounded-md px-2 h-7 text-[12px] font-semibold ${mode === m ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12.5px] font-semibold text-amber hover:underline">
          {open ? "Hide preview" : "Preview"}
        </button>
        {open && (
          <span className="inline-flex rounded-lg border border-line/15 p-0.5">
            {tab("light", "Light")}
            {tab("dark", "Dark mode")}
          </span>
        )}
      </div>
      {open && (
        <>
          <iframe
            key={mode}
            title="Email preview"
            sandbox=""
            srcDoc={doc}
            className={`mt-2 w-full h-[560px] rounded-xl border border-line/15 ${mode === "dark" ? "bg-[#17110D]" : "bg-white"}`}
          />
          <p className="mt-1.5 text-[11.5px] text-ink-faint">
            Email apps in dark mode (iPhone Mail, Outlook, Gmail) show the dark version or darken it themselves. If the preview looks odd, a dark-mode browser extension may be
            repainting it.
          </p>
        </>
      )}
    </div>
  );
}
