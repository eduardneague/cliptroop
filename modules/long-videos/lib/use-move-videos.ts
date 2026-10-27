"use client";

import { useTransition } from "react";
import { moveLongVideosStage, type LongMove, type LongMoves } from "@/app/(dashboard)/videos/bulk-actions";
import { useToast } from "@/components/ui/toast-provider";
import { LONG_VIDEOS, moveMessage } from "@/lib/bulk-text";
import { STAGE_LABELS } from "./stages";

/**
 * Long videos to a step (1.40.0, as the shorts' use-move-shorts.ts): a video's ⋯ and videos picked together. The toast
 * offers Undo (each back where it was). `run` resolves to what happened (null when it couldn't be asked).
 */
export function useMoveVideos() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(moves: LongMove[], opts: { undo?: boolean } = {}): Promise<LongMoves | null> {
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const r = await moveLongVideosStage(moves);
          if (r.error !== undefined) {
            toast.error(r.error);
            resolve(null);
            return;
          }
          const to = moves.length && moves.every((m) => m.to === moves[0].to) ? moves[0].to : null;
          const msg = moveMessage(r, to ? STAGE_LABELS[to] : null, opts.undo, LONG_VIDEOS);
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
