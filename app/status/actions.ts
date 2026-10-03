"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAlertPerson } from "@/lib/errors";

/** "Mark fixed" on an error (alert people only). If it happens again, it's alerted again. */
export async function resolveAppError(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAlertPerson(user.id))) return { error: "Only the people who get the alerts can do this." };
  const { error } = await createAdminClient().from("app_errors").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Couldn't save it." };
  revalidatePath("/status");
  return {};
}
