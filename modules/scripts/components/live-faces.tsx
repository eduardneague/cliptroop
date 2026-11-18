"use client";

import { AvatarImg } from "@/components/ui/avatar-img";
import { initialsFor } from "@/lib/avatar";
import type { LivePerson } from "./use-live-cursors";

/**
 * Who else is in this script (1.53.5), in the top bar: their faces, ringed in their cursor's colour. Click one: to
 * where they are. Nothing when you're alone.
 */
export function LiveFaces({ here, people, onJump }: { here: string[]; people: LivePerson[]; onJump: (userId: string) => void }) {
  if (!here.length) return null;
  const who = here.map((id) => people.find((p) => p.userId === id) ?? { userId: id, name: "Someone", avatarUrl: null, color: "#3159C9" });
  const names = who.map((p) => p.name);
  const label = names.length === 1 ? `${names[0]} is here too` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are here too`;
  return (
    <div className="hidden sm:flex items-center flex-shrink-0 pl-1" role="group" aria-label={label}>
      {who.slice(0, 3).map((p, i) => (
        <button
          key={p.userId}
          type="button"
          onClick={() => onJump(p.userId)}
          title={`${p.name} is here: show where`}
          aria-label={`${p.name} is here: show where`}
          className={`live-face relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[10.5px] font-bold text-white border-2 border-paper transition-transform hover:-translate-y-0.5 hover:z-10 ${i ? "-ml-2" : ""}`}
          style={{ background: p.color, boxShadow: `0 0 0 2px ${p.color}` }}
        >
          <AvatarImg src={p.avatarUrl} fallback={initialsFor(p.name)} />
        </button>
      ))}
      {who.length > 3 && (
        <span className="-ml-2 w-7 h-7 rounded-full border-2 border-paper bg-surface-2 text-ink-soft text-[10.5px] font-bold flex items-center justify-center" title={label}>
          +{who.length - 3}
        </span>
      )}
    </div>
  );
}
