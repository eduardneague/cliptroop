/*
 * "Save it now" (1.54.1): before a script is handed on to the next step (its text, pictures included, is copied there),
 * what's on the page is saved first, so the copy has the last words and the picture just put in. The script's editor
 * answers (script-editor.tsx); with no editor of that script on the page, what's saved is all there is.
 */
export const SAVE_NOW_EVENT = "vp-script-save-now";

export type SaveNow = { scriptId: string; claim: () => void; done: (ok: boolean) => void };

/** True once everything on the page is saved (or nothing of it is open here); false when it couldn't be. */
export function saveScriptNow(scriptId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let claimed = false;
    let answered = false;
    const done = (ok: boolean) => {
      if (answered) return;
      answered = true;
      resolve(ok);
    };
    if (typeof window === "undefined") return done(true);
    window.dispatchEvent(new CustomEvent<SaveNow>(SAVE_NOW_EVENT, { detail: { scriptId, claim: () => (claimed = true), done } }));
    if (!claimed) done(true);
  });
}
