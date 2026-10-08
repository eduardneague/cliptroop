"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // Back to the page that sent you here (only this site's own pages).
  const nextRaw = String(formData.get("next") ?? "");
  const next = /^\/(?!\/|\\)[^\s]*$/.test(nextRaw) && !nextRaw.startsWith("/login") && !nextRaw.startsWith("/api/") ? nextRaw.slice(0, 500) : "/dashboard";

  if (!email || !password) {
    return { error: "Enter both an email and a password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague — never confirm/deny whether an email exists.
    return { error: "Incorrect email or password." };
  }

  redirect(next);
}
