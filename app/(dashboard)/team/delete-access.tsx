"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { Segmented } from "@/components/ui/segmented";
import { CheckIcon, TrashIcon } from "@/components/ui/icons";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { setDeleteAccess, setDeleteRules, type DeleteWhat } from "./delete-access-actions";

/*
 * Team → Team → Danger zone (1.41.0, the owner only): who else deletes videos, and whether they delete one at a time or
 * several at once. The owner: "a danger zone where you can give permission to other team members to be able to delete
 * shorts or longs too"; "make the one at a time only or a lot with the password be a thing i can set in team settings".
 * Masters always can. Each change asks first and says what it did; whoever's let delete something is told.
 */

export type DeletePerson = { userId: string; name: string; avatarUrl: string | null; color: string; roles: string; master: boolean; shorts: boolean; longs: boolean };
export type DeleteRulesValue = { manyShorts: boolean; manyLongs: boolean };

const WORDS: Record<DeleteWhat, { many: string; one: string; with: string }> = {
  shorts: { many: "shorts", one: "short", with: "their scripts, history and uploaded files" },
  longs: { many: "long videos", one: "long video", with: "their scripts and research, comments, edits, thumbnails and notes" },
};

export function DeleteAccess({ teamId, ready, people: initial, rules: initialRules }: { teamId: string; /** Migration 0119 has run. */ ready: boolean; people: DeletePerson[]; rules: DeleteRulesValue }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [people, setPeople] = useState(initial);
  const [rules, setRules] = useState(initialRules);
  const [busy, setBusy] = useState<string | null>(null);

  async function flip(p: DeletePerson, what: DeleteWhat) {
    const on = !p[what];
    const w = WORDS[what];
    const ok = await confirm(
      on
        ? {
            title: `Let ${p.name} delete ${w.many}?`,
            description: `They can delete any of the team's ${w.many} for good, with ${w.with}. ${
              (what === "shorts" ? rules.manyShorts : rules.manyLongs) ? `Several at once too${what === "longs" ? ", with their password" : ""}, as you've set below.` : "One at a time, as you've set below."
            } They get a notification, and you can take it away any time.`,
            confirmLabel: "Let them delete",
            danger: true,
          }
        : { title: `Stop ${p.name} deleting ${w.many}?`, description: `The Delete buttons go from their ${w.many} lists. Nothing they deleted comes back.`, confirmLabel: "Take it away" }
    );
    if (!ok) return;
    setBusy(`${p.userId}:${what}`);
    try {
      const r = await setDeleteAccess(teamId, p.userId, what, on);
      if (r.error !== undefined) return void toast.error(r.error);
      setPeople((l) => l.map((x) => (x.userId === p.userId ? { ...x, shorts: r.shorts, longs: r.longs } : x)));
      toast.success(on ? `${p.name} can delete ${w.many} now` : `${p.name} no longer deletes ${w.many}`);
    } catch {
      toast.error("Couldn't change it. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setMany(what: DeleteWhat, many: boolean) {
    const now = what === "shorts" ? rules.manyShorts : rules.manyLongs;
    if (many === now) return;
    const w = WORDS[what];
    if (many) {
      const ok = await confirm({
        title: `Let them delete several ${w.many} at once?`,
        description:
          what === "longs"
            ? "Everyone you've let delete long videos can pick several and delete them in one go, after typing their password (as masters do)."
            : "Everyone you've let delete shorts can pick several and delete them in one go (they're asked first, as masters are).",
        confirmLabel: "Let them",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(`rules:${what}`);
    const before = rules;
    setRules((r) => (what === "shorts" ? { ...r, manyShorts: many } : { ...r, manyLongs: many }));
    try {
      const r = await setDeleteRules(teamId, what === "shorts" ? { manyShorts: many } : { manyLongs: many });
      if (r.error !== undefined) {
        setRules(before);
        return void toast.error(r.error);
      }
      toast.success(many ? `Several ${w.many} at once, from now on` : `One ${w.one} at a time, from now on`);
    } catch {
      setRules(before);
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const others = people.filter((p) => !p.master);
  const masters = people.filter((p) => p.master);
  const given = others.filter((p) => p.shorts || p.longs).length;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[12px] font-bold text-red mb-1">Who can delete videos</h3>
        <p className="text-[12px] text-ink-soft mb-3">
          Masters always can. Let anyone else on the team delete shorts, long videos or both: they go for good, with everything in them.
        </p>
        {!ready ? (
          <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">Run migration 0119 to let others delete videos.</p>
        ) : others.length === 0 ? (
          <p className="rounded-xl border border-dashed border-red/25 px-4 py-4 text-[12.5px] text-ink-soft text-center">Everyone else on the team is a master, so they can already delete. Invite people in Members first.</p>
        ) : (
          <ul className="rounded-xl border border-red/15 bg-surface divide-y divide-line/10" aria-label="Who can delete videos">
            {others.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-3 py-2.5 flex-wrap sm:flex-nowrap">
                <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-8 h-8 text-[11px] flex-shrink-0" />
                <div className="flex-1 min-w-[8rem]">
                  <p className="text-[13.5px] font-semibold truncate">{p.name}</p>
                  {p.roles && <p className="text-[11.5px] text-ink-faint truncate">{p.roles}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-11 sm:ml-0">
                  {(["shorts", "longs"] as const).map((what) => (
                    <DeleteChip key={what} label={what === "shorts" ? "Shorts" : "Long videos"} name={p.name} what={WORDS[what].many} on={p[what]} busy={busy === `${p.userId}:${what}`} disabled={!!busy} onClick={() => void flip(p, what)} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {ready && masters.length > 0 && (
          <p className="text-[11.5px] text-ink-faint mt-2">
            {`${masters.length === 1 ? masters[0].name : `${masters.length} masters`} ${masters.length === 1 ? "is a master and" : "are masters and"} can always delete.`}
            {given ? ` ${given} ${given === 1 ? "other person" : "others"} can too.` : ""}
          </p>
        )}
      </div>

      {ready && (
        <div>
          <h3 className="text-[12px] font-bold text-red mb-1">Deleting several at once</h3>
          <p className="text-[12px] text-ink-soft mb-3">For the people above. Masters can always delete several at once (long videos with their password).</p>
          <div className="space-y-2.5">
            <RuleRow label="Shorts">
              <Segmented
                size="sm"
                ariaLabel="Shorts: one at a time or several at once"
                value={rules.manyShorts ? "many" : "one"}
                onChange={(v) => void setMany("shorts", v === "many")}
                options={[
                  { value: "one", label: "One at a time", disabled: busy === "rules:shorts" },
                  { value: "many", label: "Several at once", disabled: busy === "rules:shorts" },
                ]}
              />
            </RuleRow>
            <RuleRow label="Long videos">
              <Segmented
                size="sm"
                ariaLabel="Long videos: one at a time or several at once with their password"
                value={rules.manyLongs ? "many" : "one"}
                onChange={(v) => void setMany("longs", v === "many")}
                options={[
                  { value: "one", label: "One at a time", disabled: busy === "rules:longs" },
                  { value: "many", label: "Several, with their password", disabled: busy === "rules:longs" },
                ]}
              />
            </RuleRow>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="w-24 text-[12.5px] font-semibold text-ink-soft">{label}</span>
      <div className="min-w-0 max-w-full overflow-x-auto no-scrollbar">{children}</div>
    </div>
  );
}

/** A switch shaped as a chip: on, the person may delete these (red: it's a lot of power). */
function DeleteChip({ label, name, what, on, busy, disabled, onClick }: { label: string; name: string; what: string; on: boolean; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${name} can delete ${what}`}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border pl-2 pr-2.5 h-8 text-[12.5px] font-semibold transition-colors disabled:cursor-default ${
        on ? "border-red/45 bg-red/10 text-red" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
      } ${disabled && !busy ? "opacity-60" : ""}`}
    >
      {busy ? (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/40 border-t-red animate-spin" aria-hidden />
      ) : on ? (
        <CheckIcon className="w-3.5 h-3.5" />
      ) : (
        <TrashIcon className="w-3.5 h-3.5 opacity-70" />
      )}
      {label}
    </button>
  );
}
