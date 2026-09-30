"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLongSettings } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { PersonSelect } from "@/modules/short-videos/components/person-select";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";

/** Team → Long videos: the defaults every new long video starts with. */
export function LongSettingsForm({
  teamId,
  description,
  scripter,
  people,
}: {
  teamId: string;
  description: string;
  scripter: string | null;
  people: TeamPerson[];
}) {
  const [text, setText] = useState(description);
  const [who, setWho] = useState<string | null>(scripter);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = text !== description || who !== scripter;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <div className="text-[11.5px] font-semibold text-ink-soft">Default description</div>
          <div className="text-[11px] text-ink-faint tabular-nums">{text.length}/5000</div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          rows={6}
          placeholder="Links, socials, chapters template… every long video starts from this."
          className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-amber resize-y"
        />
        <p className="mt-1 text-[11.5px] text-ink-faint">Pre-filled in each video&rsquo;s Package step; it can be edited per video.</p>
      </div>
      <div className="max-w-xs">
        <div className="text-[11.5px] font-semibold text-ink-soft mb-1.5">Default scripter</div>
        <PersonSelect kind="scripter" people={people} value={who} onChange={setWho} />
      </div>
      <button
        type="button"
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            const r = await updateLongSettings(teamId, { description: text, scripter: who });
            if ("error" in r && r.error) toast.error(r.error);
            else {
              toast.success("Long-video settings saved");
              router.refresh();
            }
          })
        }
        className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px] disabled:opacity-45"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
