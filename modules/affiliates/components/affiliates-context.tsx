"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { affiliateVideoChoices, lockLogins, openAffiliateLogin } from "@/app/(dashboard)/sponsorships/actions";
import { closedKey, SHOWN_SECONDS, writeClosed, type Company, type DealKind, type LoginUse, type Product, type VideoChoice } from "../lib/rules";
import { SPONSORSHIPS_CLOSED_COOKIE } from "../lib/view-mode";
import { CompanyDialog } from "./affiliate-dialog";
import { ProductDialog } from "./product-dialog";
import { UnlockDialog } from "./unlock-dialog";

/*
 * The Sponsorships page's shared parts in the browser (1.56.0, as Affiliates): the add / edit window, the password that
 * unlocks logins (15 minutes, this sign-in: the server keeps the time, this only shows it), and the one login being
 * shown. A shown login goes after 30 seconds, when the tab is left, or when another is shown; it lives only here, in
 * memory, never in the page's own data, storage or the address. Copying one asks the server for that part only.
 * 1.57.0: the videos to link (the team's and every one on the channel) are asked for the first time the window needs
 * them, once per visit; a new one starts as the tab's kind of deal. 1.58.0: two windows, the company's and the
 * product's (a new company goes on to its first product), and which companies are folded on the list (this viewer's,
 * kept in a cookie the page reads; a search shows them all open).
 */

/** The videos to link, as the server gives them (see readVideoChoices). */
export type VideoList = { videos: VideoChoice[]; channel: boolean };

export type ShownLogin = { id: string; username: string; password: string; notes: string; hideAt: number };

/** A company as the product's window and the menus name it (to pick one, to move products to). */
export type CompanyRef = Pick<Company, "id" | "name" | "code" | "percentage">;

/** What the product's window opens: a product, or a new one for this company. */
export type ProductEdit = Product | { companyId: string };

type Api = {
  teamId: string;
  /** The team's companies, each with all of its products (the list may show only some). */
  companies: Company[];
  manage: boolean;
  master: boolean;
  /** Logins can be kept on this server. */
  vault: boolean;
  /** Where a company's money goes and its picture can be set (0139 is in). */
  extras: boolean;
  /** What kind a new one starts as: the tab's, else an affiliate. */
  newKinds: DealKind[];
  /** The videos to link, once asked for (null before, or when they couldn't come). */
  videoList: VideoList | null;
  loadVideos: () => Promise<VideoList | null>;
  unlockedUntil: number | null;
  now: number;
  /** The password asked for if logins are locked; true once they're open. */
  ensureUnlocked: () => Promise<boolean>;
  lock: () => Promise<void>;
  openCompany: (c: Company | "new") => void;
  openProduct: (p: ProductEdit) => void;
  shown: ShownLogin | null;
  show: (c: Pick<Company, "id" | "name">) => Promise<void>;
  hide: () => void;
  copyPart: (c: Pick<Company, "id" | "name">, part: "username" | "password" | "notes") => Promise<void>;
  /** A row or card lit up for a moment (just added or changed; its company opened first). */
  flash: (id: string, companyId?: string) => void;
  /** Whether a company is open on the list (all are while searching). */
  isOpen: (companyId: string) => boolean;
  toggle: (companyId: string) => void;
  /** These companies opened or folded at once. */
  setOpen: (companyIds: string[], open: boolean) => void;
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
  companies,
  manage,
  master,
  vault,
  extras,
  kind,
  unlockedUntil: fromServer,
  closed: closedFromServer,
  searching,
  children,
}: {
  teamId: string;
  companies: Company[];
  manage: boolean;
  master: boolean;
  vault: boolean;
  extras: boolean;
  /** The tab open now (a new one starts as that kind). */
  kind: DealKind | null;
  unlockedUntil: number | null;
  /** The companies folded (closedKey of each), as the page read them from the cookie. */
  closed: string[];
  /** A search is on: every company shows open (a fold here lasts while it's on). */
  searching: boolean;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const [unlockedUntil, setUnlockedUntil] = useState<number | null>(fromServer);
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [product, setProduct] = useState<ProductEdit | null>(null);
  const [closed, setClosed] = useState<Set<string>>(() => new Set(closedFromServer));
  const [searchClosed, setSearchClosed] = useState<Set<string>>(() => new Set());
  const [asking, setAsking] = useState(false);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const [shown, setShown] = useState<ShownLogin | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [videoList, setVideoList] = useState<VideoList | null>(null);
  const asked = useRef<Promise<VideoList | null> | null>(null);

  /** The videos to link: asked for once (both windows share the answer); asked again if it didn't come. */
  const loadVideos = useCallback(() => {
    if (!asked.current)
      asked.current = affiliateVideoChoices(teamId).then(
        (r) => {
          if (r.error !== undefined) {
            asked.current = null;
            toast.error(r.error);
            return null;
          }
          const list = { videos: r.videos, channel: r.channel };
          setVideoList(list);
          return list;
        },
        () => {
          asked.current = null;
          toast.error("Couldn't get the videos. Check your connection and try again.");
          return null;
        }
      );
    return asked.current;
  }, [teamId, toast]);

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
    async (a: Pick<Company, "id" | "name">) => {
      if (!(await ensureUnlocked())) return;
      const r = await open(a.id, "viewed");
      if (!r) return;
      setNow(Date.now());
      setShown({ id: a.id, username: r.username ?? "", password: r.password ?? "", notes: r.notes ?? "", hideAt: Date.now() + SHOWN_SECONDS * 1000 });
    },
    [ensureUnlocked, open]
  );

  const copyPart = useCallback(
    async (a: Pick<Company, "id" | "name">, part: "username" | "password" | "notes") => {
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

  // A new search starts with everything open.
  useEffect(() => setSearchClosed(new Set()), [searching]);

  const isOpen = useCallback((companyId: string) => !(searching ? searchClosed : closed).has(closedKey(companyId)), [searching, searchClosed, closed]);
  /** The folds changed: kept for the next visit (a cookie for this page alone, a year). A search's own aren't kept. */
  const keep = useCallback(
    (next: Set<string>) => {
      if (searching) return setSearchClosed(next);
      setClosed(next);
      try {
        document.cookie = `${SPONSORSHIPS_CLOSED_COOKIE}=${writeClosed(next)}; path=/sponsorships; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
      } catch {
        /* folded for this visit only */
      }
    },
    [searching]
  );
  const toggle = useCallback(
    (companyId: string) => {
      const next = new Set(searching ? searchClosed : closed);
      const k = closedKey(companyId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      keep(next);
    },
    [searching, searchClosed, closed, keep]
  );
  const setOpen = useCallback(
    (companyIds: string[], open: boolean) => {
      const next = new Set(searching ? searchClosed : closed);
      for (const id of companyIds) open ? next.delete(closedKey(id)) : next.add(closedKey(id));
      keep(next);
    },
    [searching, searchClosed, closed, keep]
  );

  const flash = useCallback(
    (id: string, companyId?: string) => {
      if (companyId && !isOpen(companyId)) setOpen([companyId], true);
      let tries = 0;
      const find = () => {
        const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
        // (On the list and showing: a folded company's products aren't, until it opens.)
        if (el && el.getClientRects().length) {
          el.classList.remove("aff-fresh");
          void el.offsetWidth;
          el.classList.add("aff-fresh");
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          window.setTimeout(() => el.classList.remove("aff-fresh"), 2600);
        } else if (tries++ < 30) window.setTimeout(find, 100);
      };
      find();
    },
    [isOpen, setOpen]
  );

  const newKinds = useMemo<DealKind[]>(() => [kind ?? "affiliate"], [kind]);
  const api = useMemo<Api>(
    () => ({
      teamId,
      companies,
      manage,
      master,
      vault,
      extras,
      newKinds,
      videoList,
      loadVideos,
      unlockedUntil,
      now,
      ensureUnlocked,
      lock,
      // (The whole company, whatever the list shows of it.)
      openCompany: (c: Company | "new") => setEditing(c === "new" ? "new" : companies.find((x) => x.id === c.id) ?? c),
      openProduct: setProduct,
      shown,
      show,
      hide: () => setShown(null),
      copyPart,
      flash,
      isOpen,
      toggle,
      setOpen,
    }),
    [teamId, companies, manage, master, vault, extras, newKinds, videoList, loadVideos, unlockedUntil, now, ensureUnlocked, lock, shown, show, copyPart, flash, isOpen, toggle, setOpen]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {editing && manage && (
        <CompanyDialog
          key={editing === "new" ? "new" : editing.id}
          company={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id, fresh) => {
            setEditing(null);
            flash(id);
            // A new company: on to its first product.
            if (fresh) setProduct({ companyId: id });
          }}
        />
      )}
      {product && manage && (
        <ProductDialog
          key={"id" in product ? product.id : `new:${product.companyId}`}
          product={"id" in product ? product : null}
          companyId={product.companyId}
          onClose={() => setProduct(null)}
          onSaved={(id, companyId) => {
            setProduct(null);
            flash(id, companyId);
          }}
        />
      )}
      {asking && <UnlockDialog teamId={teamId} onDone={(until) => settle(true, until)} onCancel={() => settle(false)} />}
    </Ctx.Provider>
  );
}
