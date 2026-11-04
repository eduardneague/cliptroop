import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_DONE, ONBOARDING_KEY, onboardingPending } from "@/lib/auth/onboarding";

export const dynamic = "force-dynamic";

/**
 * A new account's first steps are over, finished or skipped (1.51.0, lib/auth/onboarding.ts): the account stops being
 * sent to them, then the app opens. Its sign-in is renewed straight after, since the old one still carries the mark
 * and the next page would send it back.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (onboardingPending(user.user_metadata)) {
    const { error } = await supabase.auth.updateUser({ data: { [ONBOARDING_KEY]: ONBOARDING_DONE } });
    if (!error) await supabase.auth.refreshSession();
  }
  const res = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
