"use client";

import { useTransition } from "react";
import { moveShortsStage, type StageMove, type StageMoves } from "@/app/(dashboard)/shorts/actions";
import { useToast } from "@/components/ui/toast-provider";
import { moveMessage } from "./bulk-text";

/**
 * Shorts to a step (1.38.0): the row's ⋯ and shorts picked together. The toast offers Undo (each back where it was).
 * `run` resolves to what happened (null when it couldn't be asked).
 */
export function useMoveShorts() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(moves: StageMove[], opts: { undo?: boolean } = {}): Promise<StageMoves | null> {
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const r = await moveShortsStage(moves);
          if (r.error !== undefined) {
            toast.error(r.error);
            resolve(null);
            return;
          }
          const to = moves.length && moves.every((m) => m.to === moves[0].to) ? moves[0].to : null;
          const msg = moveMessage(r, to, opts.undo);
          if (!msg.ok) toast.error(msg.text);
          else if (opts.undo || !r.moved.length) toast.success(msg.text);
          else
            toast.success(msg.text, {
              sound: "advance",
              action: { label: "Undo", onClick: () => void run(r.moved.map((m) => ({ id: m.id, to: m.from })), { undo: true }) },
            });
          resolve(r);
        } catch {
          toast.error("Couldn't move them. Check your connection and try again.");
          resolve(null);
        }
      });
    });
  }

  return { run, pending };
}
