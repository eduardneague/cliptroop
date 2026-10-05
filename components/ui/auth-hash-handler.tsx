"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * A dashboard-triggered Supabase invite puts the session token in a URL
 * hash fragment (#access_token=...) rather than our own custom
 * ?code=... callback flow — and a hash fragment is never sent to the
 * server, so middleware genuinely cannot see or handle it. This runs
 * client-side on every page and catches that specific case.
 *
 * Deliberately explicit rather than relying on the Supabase client's
 * automatic hash-detection: that "magic" auto-detect didn't reliably
 * fire for type=invite links in testing, so instead this parses the
 * access_token/refresh_token straight out of the hash and hands them
 * to setSession() directly — nothing left implicit to fail silently.
 */
export function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    // An expired or already-used link (Supabase sends you back with
    // #error=...&error_code=otp_expired): say so plainly.
    if (/[#&]error_code=/.test(hash) || (/[#&]error=/.test(hash) && hash.includes("error_description="))) {
      const p = new URLSearchParams(hash.slice(1));
      const type = p.get("type");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      router.replace(`/welcome?error=expired${type && /^[a-z_]{3,20}$/.test(type) ? `&type=${type}` : ""}`);
      return;
    }
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");
    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      // Always strip the token out of the visible URL/history, even on
      // failure — it's a live credential and shouldn't linger there.
      window.history.replaceState(null, "", window.location.pathname);
      if (error) {
        router.push("/login");
      } else if (type === "recovery") {
        router.push("/reset-password");
      } else {
        router.push("/set-password");
      }
    });
  }, [router]);

  return null;
}
