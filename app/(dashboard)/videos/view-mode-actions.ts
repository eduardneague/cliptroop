"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

export async function setViewMode(formData: FormData) {
  // Only the two views, and a stage that's a word (1.31.12: both used to be taken as sent).
  const mode = String(formData.get("mode") ?? "grid") === "table" ? "table" : "grid";
  const rawStage = String(formData.get("stage") ?? "");
  const stage = /^[a-z_]{1,20}$/.test(rawStage) ? rawStage : "";

  const cookieStore = await cookies();
  cookieStore.set(VIEW_MODE_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: sessionCookieOptions((await headers()).get("x-forwarded-proto")).secure,
  });

  redirect(`/videos${stage ? `?stage=${stage}` : ""}`);
}
