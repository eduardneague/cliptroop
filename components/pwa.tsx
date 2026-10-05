"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { useToast } from "@/components/ui/toast-provider";

/*
 * The installable app + push notifications, browser side.
 *   PwaRegister   registers /sw.js (root layout)
 *   PushKeeper    keeps this device's push address known to the server (dashboard layout)
 *   InstallApp    "Install app" (Android / computers) or the iPhone steps
 *   PushSettings  turn notifications on/off on this device, send a test
 *   PushKeysHelper makes the server keys (owner only, before push is set up)
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const USER_KEY = "vp-push-user";

type Platform = { ios: boolean; android: boolean; standalone: boolean; pushSupported: boolean };

function detect(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { ios, android: /Android/.test(ua), standalone, pushSupported };
}

function keyBytes(b64u: string) {
  const s = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const toB64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function sha256b64u(text: string) {
  return toB64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** This device's push subscription for the current server key (made if needed; permission must already be granted). */
async function currentSubscription(create: boolean) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = keyBytes(VAPID_PUBLIC);
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    // The server's key changed: the old address can't receive our messages any more.
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sub;
}

async function saveSubscription(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !j.ok) throw new Error(j.error || "Couldn't save it. Try again.");
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const go = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}

/**
 * If this person turned notifications on here before, make sure the server
 * still knows this device (after logging out and in again, or when the
 * browser renewed its address). `deviceHash` = what the server has for it.
 */
export function PushKeeper({ userId, deviceHash }: { userId: string; deviceHash: string | null }) {
  useEffect(() => {
    if (!VAPID_PUBLIC) return;
    let alive = true;
    (async () => {
      try {
        const p = detect();
        if (!p.pushSupported || Notification.permission !== "granted") return;
        if (localStorage.getItem(USER_KEY) !== userId) return;
        const sub = await currentSubscription(true);
        if (!alive || !sub) return;
        if ((await sha256b64u(sub.endpoint)) !== deviceHash) await saveSubscription(sub);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [userId, deviceHash]);
  return null;
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline w-[18px] h-[18px] -mt-1 text-[#0A84FF]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline w-[18px] h-[18px] -mt-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Add to Home Screen">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[13.5px] leading-snug">
          <span className="w-6 h-6 rounded-full bg-amber/15 text-amber text-[12px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

export function InstallApp() {
  const [p, setP] = useState<Platform | null>(null);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setP(detect());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!p) return <div className="h-16" aria-hidden />;

  if (p.standalone || installed) {
    return (
      <p className="text-[13.5px] flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-green/15 text-green flex items-center justify-center text-[12px] font-bold">✓</span>
        {installed ? `${APP_NAME} is installed. Open it from your home screen or app list.` : `You're using the installed ${APP_NAME} app.`}
      </p>
    );
  }

  if (p.ios) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-ink-soft">On iPhone and iPad it installs from Safari in three taps, no App Store needed:</p>
        <Steps
          items={[
            <>
              Tap the Share button <ShareIcon /> at the bottom of Safari (top right on iPad).
            </>,
            <>
              Scroll down and tap <b>Add to Home Screen</b> <AddIcon />.
            </>,
            <>
              Tap <b>Add</b>, then open {APP_NAME} from your home screen. Turn notifications on from there.
            </>,
          ]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            const r = await prompt.userChoice.catch(() => null);
            if (r?.outcome === "accepted") setInstalled(true);
            setPrompt(null);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-semibold text-[14px] px-4 h-10 hover:brightness-110"
        >
          Install {APP_NAME}
        </button>
      ) : null}
      {p.android ? (
        <Steps
          items={
            prompt
              ? [<>Tap <b>Install {APP_NAME}</b> above, then <b>Install</b>.</>, <>Open it from your home screen and turn notifications on there.</>]
              : [
                  <>In Chrome, tap the <b>⋮</b> menu (top right).</>,
                  <>Tap <b>Install app</b> (or <b>Add to Home screen</b> → <b>Install</b>).</>,
                  <>Open {APP_NAME} from your home screen and turn notifications on there.</>,
                ]
          }
        />
      ) : (
        <p className="text-[13px] text-ink-soft">
          {prompt
            ? "It opens in its own window, with its own icon in your dock or taskbar."
            : "On a computer, Chrome and Edge show an install icon at the right end of the address bar. On your phone, open this page and follow the steps there."}
        </p>
      )}
    </div>
  );
}

type PushState = "loading" | "unsupported" | "needs-install" | "not-configured" | "denied" | "off" | "on";

export function PushSettings({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const refresh = useCallback(async () => {
    const p = detect();
    if (!p.pushSupported) return setState(p.ios && !p.standalone ? "needs-install" : "unsupported");
    if (!VAPID_PUBLIC) return setState("not-configured");
    if (Notification.permission === "denied") return setState("denied");
    if (Notification.permission !== "granted") return setState("off");
    try {
      const sub = await currentSubscription(false);
      setState(sub && localStorage.getItem(USER_KEY) === userId ? "on" : "off");
    } catch {
      setState("off");
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const turnOn = () =>
    start(async () => {
      try {
        // Must be asked from the tap itself (iPhone requires it).
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setState(perm === "denied" ? "denied" : "off");
          if (perm === "denied") toast.error("Notifications are blocked for this site. See below to allow them.");
          return;
        }
        const sub = await currentSubscription(true);
        if (!sub) throw new Error("This browser didn't give an address for notifications.");
        await saveSubscription(sub);
        localStorage.setItem(USER_KEY, userId);
        setState("on");
        toast.success("Notifications are on for this device.");
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        toast.error(
          /permission denied|NotAllowed/i.test(msg) || (e instanceof DOMException && e.name === "NotAllowedError")
            ? "This browser didn't allow it. Private or incognito windows can't get notifications: try a normal window or the installed app."
            : /push service|AbortError|network/i.test(msg)
              ? "Couldn't reach this browser's notification service. Check the internet connection and try again."
              : msg || "Couldn't turn them on."
        );
      }
    });

  const turnOff = () =>
    start(async () => {
      try {
        const sub = await currentSubscription(false);
        if (sub) {
          await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
          await sub.unsubscribe().catch(() => {});
        }
        localStorage.removeItem(USER_KEY);
        setState("off");
        toast.success("Notifications are off for this device.");
        router.refresh();
      } catch {
        toast.error("Couldn't turn them off. Try again.");
      }
    });

  const test = () =>
    start(async () => {
      const res = await fetch("/api/push/test", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; sent?: number; error?: string };
      if (j.ok) toast.success(j.sent && j.sent > 1 ? `Sent to your ${j.sent} devices.` : "Sent! It should pop up in a moment.");
      else toast.error(j.error || "Couldn't send it.");
    });

  const btn = "inline-flex items-center justify-center rounded-xl font-semibold text-[13.5px] px-4 h-10 disabled:opacity-60";
  const status = (dot: string, text: string) => (
    <p className="text-[13.5px] flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden />
      {text}
    </p>
  );

  if (state === "loading") return <div className="h-16" aria-hidden />;
  if (state === "needs-install")
    return (
      <div className="space-y-2">
        {status("bg-amber", "On iPhone and iPad, notifications only work in the installed app.")}
        <p className="text-[12.5px] text-ink-soft">Install it with the steps above, open it from your home screen, then come back here (Settings → Notifications).</p>
      </div>
    );
  if (state === "unsupported")
    return status("bg-ink-faint", "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari, or the installed app.");
  if (state === "not-configured") return status("bg-ink-faint", "Notifications aren't set up on the server yet. The team owner can set them up.");
  if (state === "denied")
    return (
      <div className="space-y-2">
        {status("bg-red", "Notifications are blocked for this site on this device.")}
        <p className="text-[12.5px] text-ink-soft">
          iPhone: Settings → Notifications → {APP_NAME} → Allow Notifications. Android: long-press the {APP_NAME} icon → App info → Notifications. Computer: click the
          icon left of the address → Notifications → Allow. Then reload this page.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {state === "on"
        ? status("bg-green", "On for this device. You'll get the same notifications as the bell.")
        : status("bg-ink-faint", "Off for this device.")}
      <div className="flex flex-wrap gap-2">
        {state === "on" ? (
          <>
            <button type="button" onClick={test} disabled={busy} className={`${btn} bg-amber text-white hover:brightness-110`}>
              Send me a test
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className={`${btn} border border-line/20 hover:border-line/40 hover:bg-surface-2`}>
              Turn off on this device
            </button>
          </>
        ) : (
          <button type="button" onClick={turnOn} disabled={busy} className={`${btn} bg-amber text-white hover:brightness-110`}>
            Turn on notifications
          </button>
        )}
      </div>
    </div>
  );
}

/** Owner only, while push isn't set up: makes the two keys in this browser (never sent anywhere). */
export function PushKeysHelper() {
  const [keys, setKeys] = useState<{ pub: string; priv: string } | null>(null);
  const toast = useToast();
  const make = async () => {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const raw = await crypto.subtle.exportKey("raw", kp.publicKey);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    setKeys({ pub: toB64u(raw), priv: jwk.d ?? "" });
  };
  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy: select it and copy by hand.");
    }
  };
  const row = (name: string, value: string) => (
    <div className="space-y-1">
      <div className="text-[11.5px] font-semibold text-ink-soft">Key</div>
      <code className="block text-[12px] font-mono rounded-lg bg-surface-2 px-3 py-2 break-all select-all">{name}</code>
      <div className="text-[11.5px] font-semibold text-ink-soft pt-1">Value</div>
      <div className="flex gap-2 items-start">
        <code className="flex-1 min-w-0 block text-[12px] font-mono rounded-lg bg-surface-2 px-3 py-2 break-all select-all">{value}</code>
        <button type="button" onClick={() => copy(value)} className="rounded-lg border border-line/20 px-3 h-9 text-[12.5px] font-semibold hover:bg-surface-2 flex-shrink-0">
          Copy
        </button>
      </div>
    </div>
  );
  return (
    <div className="rounded-xl border border-amber/40 bg-amber/[0.06] p-4 space-y-3">
      <p className="text-[13.5px] font-semibold">Set up notifications (one time, only you see this)</p>
      {!keys ? (
        <>
          <p className="text-[12.5px] text-ink-soft">
            The server needs a pair of keys to send notifications. This button makes them right here in your browser; they&rsquo;re not sent anywhere.
          </p>
          <button type="button" onClick={make} className="inline-flex items-center rounded-xl bg-amber text-white font-semibold text-[13.5px] px-4 h-10 hover:brightness-110">
            Make the keys
          </button>
        </>
      ) : (
        <>
          <Steps
            items={[
              <>Open vercel.com → your project → <b>Settings</b> → <b>Environment Variables</b>.</>,
              <>Add the first key below: click <b>Add</b>, paste the Key and the Value, tick <b>Production</b>, <b>Preview</b> and <b>Development</b>, <b>Save</b>.</>,
              <>Do the same for the second key.</>,
              <>Go to <b>Deployments</b> → <b>⋯</b> next to the newest one → <b>Redeploy</b> (production), and push anything to staging. Then come back here.</>,
            ]}
          />
          {row("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.pub)}
          {row("VAPID_PRIVATE_KEY", keys.priv)}
          <p className="text-[12px] text-ink-faint">The second one is secret: don&rsquo;t share it. Leaving this page forgets both (make new ones if you lose them).</p>
        </>
      )}
    </div>
  );
}
