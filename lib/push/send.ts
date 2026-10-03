import "server-only";
import { after } from "next/server";
import { createAdminClient } from "../supabase/admin";
import { appUrl } from "../email";
import { CONTACT_EMAIL } from "../brand";
import { sendWebPush, type SendResult } from "./web-push";

/*
 * Push notifications: every in-app notification also goes to each device the
 * person turned notifications on for (push_subscriptions, migration 0065).
 * Sent after the response (Next's after()), so nobody waits for it. Devices
 * that unsubscribed are removed; ones that keep failing are dropped after 8
 * tries in a row.
 */

/** `tag`: only for messages that SHOULD replace the previous one on the device (e.g. the test). */
export type PushMessage = { userId: string; title: string; body: string; url: string; tag?: string };

export function pushConfigured() {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

function vapidKeys() {
  const subject = process.env.VAPID_SUBJECT || (CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : appUrl() || "mailto:push@example.com");
  return { publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY!, subject };
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failures: number };

/** Sends now and waits (used by the test button and the after() below). Never throws. */
export async function pushToUsers(messages: PushMessage[]): Promise<{ sent: number; failed: number; devices: number }> {
  const out = { sent: 0, failed: 0, devices: 0 };
  try {
    if (!pushConfigured() || !messages.length) return out;
    const admin = createAdminClient();
    const ids = [...new Set(messages.map((m) => m.userId))];
    const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth, failures").in("user_id", ids);
    if (error || !data?.length) return out; // before 0065, or nobody has a device yet
    const byUser = new Map<string, Sub[]>();
    for (const s of data as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    out.devices = data.length;
    const keys = vapidKeys();

    const jobs: { sub: Sub; msg: PushMessage }[] = [];
    for (const msg of messages) for (const sub of byUser.get(msg.userId) ?? []) jobs.push({ sub, msg });

    const ok: string[] = [];
    const gone: string[] = [];
    const failed: Sub[] = [];
    // A few at a time: a burst (a team-wide notice) shouldn't open hundreds of connections.
    for (let i = 0; i < jobs.length; i += 10) {
      const batch = jobs.slice(i, i + 10);
      const results: SendResult[] = await Promise.all(
        batch.map(({ sub, msg }) =>
          sendWebPush(
            sub,
            { title: msg.title.slice(0, 80), body: msg.body.slice(0, 300), url: msg.url, tag: msg.tag, at: new Date().toISOString() },
            keys,
            // No Topic: two different notifications must never replace each other.
            { urgency: "high" }
          )
        )
      );
      results.forEach((r, k) => {
        const sub = batch[k].sub;
        if (r.ok) ok.push(sub.id);
        else if (r.gone) gone.push(sub.id);
        else failed.push(sub);
      });
    }
    out.sent = ok.length;
    out.failed = gone.length + failed.length;

    const now = new Date().toISOString();
    await Promise.all([
      ok.length ? admin.from("push_subscriptions").update({ last_sent_at: now, failures: 0 }).in("id", [...new Set(ok)]) : null,
      gone.length ? admin.from("push_subscriptions").delete().in("id", [...new Set(gone)]) : null,
      ...[...new Map(failed.map((s) => [s.id, s])).values()].map((s) =>
        s.failures + 1 >= 8
          ? admin.from("push_subscriptions").delete().eq("id", s.id)
          : admin.from("push_subscriptions").update({ failures: s.failures + 1 }).eq("id", s.id)
      ),
    ]);
  } catch (e) {
    console.error("[push]", e instanceof Error ? e.message : e);
  }
  return out;
}

/** Sends after the response is on its way (falls back to right away outside a request). */
export function queuePush(messages: PushMessage[]) {
  if (!messages.length || !pushConfigured()) return;
  try {
    after(() => pushToUsers(messages));
  } catch {
    void pushToUsers(messages);
  }
}

/** "iPhone · Safari", "Android · Chrome", "Windows · Edge" … from the browser's user agent. */
export function deviceLabel(ua: string | null | undefined) {
  const s = ua ?? "";
  const os = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /Macintosh|Mac OS X/.test(s)
          ? "Mac"
          : /Windows/.test(s)
            ? "Windows"
            : /Linux/.test(s)
              ? "Linux"
              : "Device";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /SamsungBrowser/.test(s)
      ? "Samsung Internet"
      : /Firefox\//.test(s)
        ? "Firefox"
        : /OPR\//.test(s)
          ? "Opera"
          : /Chrome\//.test(s)
            ? "Chrome"
            : /Safari\//.test(s)
              ? "Safari"
              : "browser";
  return `${os} · ${browser}`;
}
