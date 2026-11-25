"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { lockLogins, openAffiliateLogin } from "@/app/(dashboard)/affiliates/actions";
import { SHOWN_SECONDS, type Affiliate, type LoginUse, type VideoChoice } from "../lib/rules";
import { AffiliateDialog } from "./affiliate-dialog";
import { UnlockDialog } from "./unlock-dialog";

/*
 * The Affiliates page's shared parts in the browser (1.56.0): the add / edit window, the password that unlocks logins
 * (15 minutes, this sign-in: the server keeps the time, this only shows it), and the one login being shown. A shown
 * login goes after 30 seconds, when the tab is left, or when another is shown; it lives only here, in memory, never in
 * the page's own data, storage or the address. Copying one asks the server for that part only.
 */

export type ShownLogin = { id: string; username: string; password: string; notes: string; hideAt: number };

type Api = {
  teamId: string;
  manage: boolean;
  master: boolean;
  /** Logins can be kept on this server. */
  vault: boolean;
  videos: VideoChoice[];
  unlockedUntil: number | null;
  now: number;
  /** The password asked for if logins are locked; true once they're open. */
  ensureUnlocked: () => Promise<boolean>;
  lock: () => Promise<void>;
  openEditor: (a: Affiliate | "new") => void;
  shown: ShownLogin | null;
  show: (a: Pick<Affiliate, "id" | "name">) => Promise<void>;
  hide: () => void;
  copyPart: (a: Pick<Affiliate, "id" | "name">, part: "username" | "password" | "notes") => Promise<void>;
  /** A row or card lit up for a moment (just added or changed). */
  flash: (id: string) => void;
};

const Ctx = createContext<Api | null>(null);
export const useAffiliates = () => useContext(Ctx);

/**
 * Text to the clipboard from something still on its way (the server opening a login): Safari only lets a page write
 * to it within the click itself, so the clipboard is handed the promise at once (ClipboardItem); elsewhere, after.
 */
export async function copyWhenReady(value: Promise<string | null>): Promise<boolean> {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (!clip) return false;
  if (typeof ClipboardItem !== "undefined" && clip.write) {
    try {
      const blob = value.then((v) => {
        if (v === null) throw new Error("nothing");
        return new Blob([v], { type: "text/plain" });
      });
      await clip.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    } catch {
      /* the value didn't come, or this browser wants plain text: below */
    }
  }
  const v = await value.catch(() => null);
  if (v === null) return false;
  try {
    await clip.writeText(v);
    return true;
  } catch {
    return false;
  }
}

const PART_NAME = { username: "Username", password: "Password", notes: "Login notes" } as const;

export function AffiliatesProvider({
  teamId,
  manage,
  master,
  vault,
  videos,
  unlockedUntil: fromServer,
  children,
}: {
  teamId: string;
  manage: boolean;
  master: boolean;
  vault: boolean;
  videos: VideoChoice[];
  unlockedUntil: number | null;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const [unlockedUntil, setUnlockedUntil] = useState<number | null>(fromServer);
  const [editing, setEditing] = useState<Affiliate | "new" | null>(null);
  const [asking, setAsking] = useState(false);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const [shown, setShown] = useState<ShownLogin | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The server's word on each visit (a refresh after unlocking or locking says it again).
  useEffect(() => setUnlockedUntil(fromServer), [fromServer]);

  // A clock while something counts down: the unlock, a shown login.
  const counting = !!shown || !!unlockedUntil;
  useEffect(() => {
    if (!counting) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [counting]);
  useEffect(() => {
    if (shown && now >= shown.hideAt) setShown(null);
    if (unlockedUntil && now >= unlockedUntil) {
      setUnlockedUntil(null);
      setShown(null);
    }
  }, [now, shown, unlockedUntil]);

  // Leaving the tab hides a shown login at once.
  useEffect(() => {
    if (!shown) return;
    const away = () => document.visibilityState === "hidden" && setShown(null);
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", away);
    return () => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", away);
    };
  }, [shown]);

  const ensureUnlocked = useCallback(async () => {
    if (unlockedUntil && unlockedUntil > Date.now() + 2000) return true;
    if (answer.current) answer.current(false);
    setAsking(true);
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
    });
  }, [unlockedUntil]);

  const settle = (ok: boolean, until?: number) => {
    if (ok && until) setUnlockedUntil(until);
    setAsking(false);
    answer.current?.(ok);
    answer.current = null;
  };

  const lock = useCallback(async () => {
    setShown(null);
    setUnlockedUntil(null);
    try {
      await lockLogins();
      toast.success("Logins locked");
    } catch {
      toast.error("Couldn't lock them here. They lock by themselves in a few minutes.");
    }
  }, [toast]);

  /** The server, asked for one login (or a part); asked for the password first if it says they're locked. */
  const open = useCallback(
    async (id: string, how: LoginUse, again = true): Promise<{ username?: string; password?: string; notes?: string } | null> => {
      try {
        const r = await openAffiliateLogin(teamId, id, how);
        if (r.error !== undefined) {
          if (r.locked && again) {
            setUnlockedUntil(null);
            if (await ensureUnlocked()) return open(id, how, false);
            return null;
          }
          toast.error(r.error);
          return null;
        }
        setUnlockedUntil(r.until);
        return r;
      } catch {
        toast.error("Couldn't open it. Check your connection and try again.");
        return null;
      }
    },
    [teamId, ensureUnlocked, toast]
  );

  const show = useCallback(
    async (a: Pick<Affiliate, "id" | "name">) => {
      if (!(await ensureUnlocked())) return;
      const r = await open(a.id, "viewed");
      if (!r) return;
      setNow(Date.now());
      setShown({ id: a.id, username: r.username ?? "", password: r.password ?? "", notes: r.notes ?? "", hideAt: Date.now() + SHOWN_SECONDS * 1000 });
    },
    [ensureUnlocked, open]
  );

  const copyPart = useCallback(
    async (a: Pick<Affiliate, "id" | "name">, part: "username" | "password" | "notes") => {
      // Shown already: copied from what's on screen (nothing asked again).
      if (shown?.id === a.id) {
        const v = shown[part];
        if (!v) return void toast.error(`There's no ${PART_NAME[part].toLowerCase()} in ${a.name}'s login.`);
        const ok = await copyWhenReady(Promise.resolve(v));
        return void (ok ? toast.success(`${PART_NAME[part]} copied`) : toast.error("Couldn't copy it. Show the login and copy it by hand."));
      }
      if (!(await ensureUnlocked())) return;
      let empty = false;
      const value = open(a.id, `copied_${part}`).then((r) => {
        const v = r ? r[part] ?? null : null;
        if (r && !v) empty = true;
        return v || null;
      });
      const ok = await copyWhenReady(value);
      if (ok) toast.success(`${PART_NAME[part]} of ${a.name} copied`);
      else if (empty) toast.error(`There's no ${PART_NAME[part].toLowerCase()} in ${a.name}'s login.`);
      else if (await value) toast.error("Couldn't copy it. Show the login and copy it by hand.");
    },
    [shown, ensureUnlocked, open, toast]
  );

  const flash = useCallback((id: string) => {
    let tries = 0;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
      if (el) {
        el.classList.remove("aff-fresh");
        void el.offsetWidth;
        el.classList.add("aff-fresh");
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        window.setTimeout(() => el.classList.remove("aff-fresh"), 2600);
      } else if (tries++ < 30) window.setTimeout(find, 100);
    };
    find();
  }, []);

  const api = useMemo<Api>(
    () => ({ teamId, manage, master, vault, videos, unlockedUntil, now, ensureUnlocked, lock, openEditor: setEditing, shown, show, hide: () => setShown(null), copyPart, flash }),
    [teamId, manage, master, vault, videos, unlockedUntil, now, ensureUnlocked, lock, shown, show, copyPart, flash]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {editing && manage && (
        <AffiliateDialog
          key={editing === "new" ? "new" : editing.id}
          affiliate={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            flash(id);
          }}
        />
      )}
      {asking && <UnlockDialog teamId={teamId} onDone={(until) => settle(true, until)} onCancel={() => settle(false)} />}
    </Ctx.Provider>
  );
}
