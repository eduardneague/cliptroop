"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SHORTS_VIEW_COOKIE } from "@/modules/short-videos/lib/view-mode";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

export async function setShortsViewMode(formData: FormData) {
  const mode = String(formData.get("mode") ?? "table") === "grid" ? "grid" : "table";
  const qs = String(formData.get("qs") ?? "");

  const cookieStore = await cookies();
  cookieStore.set(SHORTS_VIEW_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: sessionCookieOptions((await headers()).get("x-forwarded-proto")).secure,
  });

  const params = new URLSearchParams(qs);
  params.delete("view");
  redirect(`/shorts${params.toString() ? `?${params}` : ""}`);
}
