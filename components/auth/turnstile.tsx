"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile (1.45.0): the "not a robot" check on creating an account, now that anyone can make one. Shown
 * only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; the server checks the answer with Cloudflare (TURNSTILE_SECRET_KEY,
 * lib/auth/turnstile-verify.ts) before Supabase makes the account. Mostly it's invisible: Cloudflare asks for a click
 * only when it's unsure.
 *
 * Its script is added by the app's own code, which the page's CSP trusts ('strict-dynamic'), and its box is a frame
 * (frame-src allows https:): no CSP change needed.
 */
export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (api()) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile didn't load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The check's box. `onToken` gets its answer (null when it expires or fails: the form waits for a new one); a new
 * `resetKey` asks again (a token works once, so after every try that reached Supabase).
 */
export function Turnstile({ onToken, resetKey = 0, action }: { onToken: (token: string | null) => void; resetKey?: number; action: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  });

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let gone = false;
    load()
      .then(() => {
        const t = api();
        if (gone || !box.current || !t) return;
        id.current = t.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          size: "flexible",
          callback: (token: string) => cb.current(token),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      gone = true;
      const t = api();
      if (id.current && t) t.remove(id.current);
      id.current = null;
    };
  }, [action]);

  useEffect(() => {
    const t = api();
    if (!resetKey || !id.current || !t) return;
    t.reset(id.current);
    cb.current(null);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}
