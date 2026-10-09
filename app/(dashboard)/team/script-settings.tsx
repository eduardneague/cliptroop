"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setScriptPeople } from "@/app/(dashboard)/scripts/actions";
import { useToast } from "@/components/ui/toast-provider";
import { ScripterPicker } from "@/modules/short-videos/components/scripter-picker";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";

/**
 * Team → Defaults → Scripts: who reviews and who stages, for every short and
 * long video (each video can change it on its script page). They're
 * notified when a script reaches them ("Ready for review / staging").
 */
export function ScriptSettingsForm({ teamId, defaults, people, ready }: { teamId: string; defaults: { review: string[]; staging: string[] }; people: TeamPerson[]; ready: boolean }) {
  const [lists, setLists] = useState(defaults);
  const toast = useToast();
  const router = useRouter();
  async function save(step: "review" | "staging", ids: string[]) {
    const prev = lists[step];
    setLists((l) => ({ ...l, [step]: ids }));
    const r = await setScriptPeople({ teamId, step, memberIds: ids });
    if (r.error !== undefined) {
      setLists((l) => ({ ...l, [step]: prev }));
      toast.error(r.error);
    } else {
      toast.success(step === "review" ? "Script reviewers saved" : "Staging people saved");
      router.refresh();
    }
  }
  if (!ready) return <p className="text-[13px] text-ink-soft">Run migration 0062 to choose who reviews and stages scripts.</p>;
  const rows = [
    { step: "review" as const, title: "Review", what: "Check the script and make the changes. Notified when a script is ready for review." },
    { step: "staging" as const, title: "Staging", what: "Get it ready for filming and editing. Notified when it's ready for staging." },
  ];
  return (
    <div className="space-y-5">
      <p className="text-[12px] text-ink-soft -mt-2">
        The Script is written by each video&rsquo;s scripters (defaults in Short videos and Long videos). These people can also edit their document.
      </p>
      {rows.map((r) => {
        const value = lists[r.step].filter((id) => people.some((p) => p.memberId === id));
        return (
          <div key={r.step}>
            <div className="text-[11.5px] font-semibold text-ink-soft mb-0.5">{r.title}</div>
            <p className="text-[11.5px] text-ink-faint mb-2">{r.what}</p>
            <ScripterPicker
              people={people}
              value={value}
              kind="reviewer"
              noun={r.step === "review" ? "reviewer" : "person"}
              emptyHint="Nobody yet"
              onAdd={(m) => void save(r.step, [...value.filter((x) => x !== m), m])}
              onRemove={(m) => void save(r.step, value.filter((x) => x !== m))}
            />
          </div>
        );
      })}
    </div>
  );
}
