"use client";

import { useRef, useTransition } from "react";
import { setRoleColor } from "./actions";
import { useToast } from "@/components/ui/toast-provider";
import { ColorPicker } from "@/components/ui/color-picker";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";

export function RoleColorPicker({
  teamId,
  roleColors,
}: {
  teamId: string;
  roleColors: Record<RoleId, string>;
}) {
  const [, startTransition] = useTransition();
  const toast = useToast();
  // Typing a colour saves on every valid code: one "saved" toast once you stop.
  const said = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(role: RoleId, color: string) {
    startTransition(async () => {
      const result = await setRoleColor(teamId, role, color);
      if (result?.error) toast.error(result.error);
      else {
        if (said.current) clearTimeout(said.current);
        const name = ROLES.find((r) => r.id === role)?.name ?? "Role";
        said.current = setTimeout(() => toast.success(`${name} colour saved`), 700);
      }
    });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {ROLES.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2.5 rounded-lg border border-line/10 px-3 py-2.5"
        >
          <ColorPicker
            value={roleColors[r.id]?.startsWith("#") ? roleColors[r.id] : "#888888"}
            onChange={(color) => handleChange(r.id, color)}
          />
          <span className="text-[12.5px] font-semibold">{r.name}</span>
        </div>
      ))}
    </div>
  );
}
