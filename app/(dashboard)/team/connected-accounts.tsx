"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { disconnectSocialAccount } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { relativeTime } from "@/lib/relative-time";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ChevronDownIcon } from "@/components/ui/icons";

export type AccountView = {
  platform: "youtube" | "instagram" | "tiktok";
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  status: "active" | "needs_reconnect";
  lastError: string | null;
  connectedAt: string;
  /** Connected, but missing a permission added later (YouTube). */
  missingPermission?: boolean;
};
export type HistoryView = { id: number; platform: string; action: string; actor: string | null; account: string | null; at: string };

const META = {
  youtube: { name: "YouTube", hint: "Your channel. Posts are uploaded and scheduled on YouTube itself." },
  instagram: { name: "Instagram", hint: "A Professional (Business or Creator) account." },
  tiktok: { name: "TikTok", hint: "Your TikTok account." },
} as const;

const ERRORS: Record<string, string> = {
  not_configured: "isn't set up on the server yet (missing app keys).",
  forbidden: "can only be connected by the master or a scheduler.",
  expired: "sign-in expired. Try connecting again.",
  cancelled: "connection was cancelled.",
  failed: "couldn't be connected.",
  bad_request: "link was invalid.",
};

const ACTION: Record<string, string> = {
  connected: "connected",
  reconnected: "reconnected",
  disconnected: "disconnected",
  refreshed: "sign-in renewed automatically",
  refresh_failed: "sign-in expired, needs reconnecting",
};

export function ConnectedAccounts({
  teamId,
  accounts,
  configured,
  canManage,
  history,
}: {
  teamId: string;
  accounts: AccountView[];
  configured: Record<"youtube" | "instagram" | "tiktok", boolean>;
  canManage: boolean;
  history: HistoryView[] | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);

  // Result of coming back from a platform's sign-in screen.
  useEffect(() => {
    const ok = params.get("social");
    const err = params.get("social_error");
    const p = params.get("platform") as keyof typeof META | null;
    if (!ok && !err) return;
    const name = p && META[p] ? META[p].name : "The account";
    if (ok === "connected") toast.success(`${name} connected`);
    else if (err) toast.error(`${name} ${ERRORS[err] ?? ERRORS.failed}${params.get("message") ? ` (${params.get("message")})` : ""}`);
    router.replace(`${pathname}#connected-accounts`, { scroll: false });
  }, [params, pathname, router, toast]);

  async function disconnect(platform: AccountView["platform"]) {
    const ok = await confirm({
      title: `Disconnect ${META[platform].name}?`,
      description: "Scheduled posts to it will stop. You can connect it again any time.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    setBusy(platform);
    const res = await disconnectSocialAccount(teamId, platform);
    setBusy(null);
    if ("error" in res && res.error) toast.error(res.error);
    else {
      toast.success(`${META[platform].name} disconnected`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {(["youtube", "instagram", "tiktok"] as const).map((p) => {
          const a = accounts.find((x) => x.platform === p);
          const needs = a?.status === "needs_reconnect";
          return (
            <div
              key={p}
              className={`rounded-xl border p-4 flex flex-col gap-3 ${needs ? "border-amber bg-amber/5" : "border-line/10 bg-surface-2/40"}`}
            >
              <div className="flex items-center gap-2.5">
                <PlatformIcon platform={p} className="w-7 h-7 rounded-lg" />
                <span className="text-[14px] font-semibold">{META[p].name}</span>
                <span className="flex-1" />
                {a && (
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${needs ? "text-amber" : "text-green"}`}>
                    {needs ? "Reconnect" : "Connected"}
                  </span>
                )}
              </div>

              {a ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-surface-2 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{a.displayName ?? a.username ?? "Connected account"}</div>
                    <div className="text-[12px] text-ink-soft truncate">
                      {a.username ? `@${a.username.replace(/^@/, "")} · ` : ""}since {relativeTime(a.connectedAt)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-soft">{META[p].hint}</p>
              )}
              {needs && a?.lastError && <p className="text-[12px] text-amber">{a.lastError}</p>}
              {!needs && a?.missingPermission && (
                <p className="text-[12px] text-amber">Reconnect once to allow changing and cancelling videos already scheduled on YouTube.</p>
              )}

              {canManage && (
                <div className="flex items-center gap-2 mt-auto">
                  {(!a || needs || a.missingPermission) && (
                    <a
                      href={configured[p] ? `/api/social/${p}/connect?team=${teamId}` : undefined}
                      aria-disabled={!configured[p]}
                      onClick={(e) => {
                        if (!configured[p]) {
                          e.preventDefault();
                          toast.error(`${META[p].name} ${ERRORS.not_configured}`);
                        } else setBusy(p);
                      }}
                      className={`press inline-flex items-center gap-1.5 rounded-lg px-3.5 h-9 text-[13px] font-bold ${
                        configured[p] ? "bg-amber text-white hover:brightness-110" : "bg-surface-2 text-ink-faint cursor-not-allowed"
                      }`}
                    >
                      {busy === p && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                      {a ? "Reconnect" : "Connect"}
                    </a>
                  )}
                  {a && !needs && !a.missingPermission && configured[p] && (
                    <a href={`/api/social/${p}/connect?team=${teamId}`} className="rounded-lg px-3 h-9 inline-flex items-center text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
                      Reconnect
                    </a>
                  )}
                  {a && (
                    <button
                      type="button"
                      onClick={() => void disconnect(p)}
                      disabled={busy === p}
                      className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-red hover:bg-red/10"
                    >
                      {busy === p ? "Disconnecting…" : "Disconnect"}
                    </button>
                  )}
                  {!configured[p] && !a && <span className="text-[11.5px] text-ink-faint">Keys not added yet</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {history && history.length > 0 && (
        <details className="group rounded-xl border border-line/10">
          <summary className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">History</span>
            <span className="rounded-full bg-surface-2 px-2 h-5 inline-flex items-center text-[11px] font-bold text-ink-soft tabular-nums">{history.length}</span>
            <span className="flex-1" />
            <ChevronDownIcon className="w-4 h-4 text-ink-soft transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ol className="space-y-1.5 px-3.5 pb-3">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                <PlatformIcon platform={h.platform as AccountView["platform"]} className="w-4 h-4 rounded" />
                <span>
                  <b className="text-ink font-semibold">
                    {h.actor ?? (META[h.platform as AccountView["platform"]]?.name ?? "VPlanner")}
                  </b>{" "}
                  {ACTION[h.action] ?? h.action}
                  {h.account ? ` ${h.account}` : ""}
                </span>
                <span className="text-ink-faint">· {relativeTime(h.at)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
