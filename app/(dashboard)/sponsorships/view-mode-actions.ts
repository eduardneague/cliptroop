"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AFFILIATES_VIEW_COOKIE } from "@/modules/affiliates/lib/view-mode";
import { SPONSORSHIPS_PATH } from "@/modules/affiliates/lib/rules";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

/** Cards or table, remembered (as the shorts list's): the server's way when there's no JavaScript. */
export async function setAffiliatesViewMode(formData: FormData) {
  const mode = String(formData.get("mode") ?? "table") === "grid" ? "grid" : "table";
  const qs = String(formData.get("qs") ?? "");

  const cookieStore = await cookies();
  cookieStore.set(AFFILIATES_VIEW_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: sessionCookieOptions((await headers()).get("x-forwarded-proto")).secure,
  });

  const params = new URLSearchParams(qs);
  params.delete("view");
  redirect(`${SPONSORSHIPS_PATH}${params.toString() ? `?${params}` : ""}`);
}
