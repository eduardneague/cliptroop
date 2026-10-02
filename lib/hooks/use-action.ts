"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast-provider";

type ActionResult = { error?: string } | void | undefined | null;

/**
 * THE standard way to call a server action from a component.
 *
 *   const assign = useAction(assignMember, {
 *     optimistic: (projectId, stage, memberId) => addOptimistic(...),
 *     success: "Assigned — they've been notified",
 *   });
 *   assign.run(projectId, stage, memberId);
 *
 * - `optimistic` runs FIRST, inside the same transition, so the UI
 *   updates instantly (pair it with React's useOptimistic). If the server
 *   says no, React throws the optimistic state away automatically — no
 *   manual rollback.
 * - Errors returned as `{ error }` (the convention every action in this
 *   app follows) become an error toast; thrown errors get a generic one.
 * - `run` resolves to true/false, for callers that need to follow up.
 */
export function useAction<Args extends unknown[], R extends ActionResult>(
  action: (...args: Args) => Promise<R>,
  opts: {
    optimistic?: (...args: Args) => void;
    success?: string | ((...args: Args) => string);
    /** A different sound for the success toast (e.g. "advance" when a video moves on). */
    sound?: import("@/lib/sounds").SoundName;
    onSuccess?: (result: R, ...args: Args) => void;
    onError?: (message: string, ...args: Args) => void;
  } = {}
) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function run(...args: Args): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        opts.optimistic?.(...args);
        try {
          const result = await action(...args);
          const error =
            result && typeof result === "object" && "error" in result ? result.error : undefined;
          if (error) {
            toast.error(error);
            opts.onError?.(error, ...args);
            resolve(false);
            return;
          }
          if (opts.success) {
            toast.success(typeof opts.success === "function" ? opts.success(...args) : opts.success, opts.sound ? { sound: opts.sound } : undefined);
          }
          opts.onSuccess?.(result, ...args);
          resolve(true);
        } catch {
          const message = "Something went wrong. Try again.";
          toast.error(message);
          opts.onError?.(message, ...args);
          resolve(false);
        }
      });
    });
  }

  return { run, pending };
}
