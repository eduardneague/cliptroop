import type { TodoBoard } from "./model";

/*
 * Your To Do as last seen in this tab (1.55.8), so the top bar's panel opens with it at once and then checks for newer
 * (it read everything again each time it opened, behind a skeleton, after loading its own code: the owner, "how come
 * the my day widget loads instantly but the one in the top bar loads really slowly?").
 *
 * Kept by whatever has it: the board a page came with (the dashboard's widget, To Do) when nothing's kept yet, every
 * change made in any of them (use-todo-store.ts), and each read (GET /api/todo/board). `at`: as of when (a read counts
 * from when it was asked, so a change made while it was out isn't undone by it).
 */
let kept: { board: TodoBoard; at: number } | null = null;
let readAsked = 0;
/** The last change made in this tab (a to-do added, ticked...): the next open reads, even right after a read. */
let changedHere = 0;
let asking: Promise<TodoBoard | null> | null = null;

export const keptBoard = () => kept;

/** `here`: a change made in this tab (not a read): one still on its way to the server shows with the next read. */
export function keepBoard(board: TodoBoard, at = Date.now(), here = false) {
  if (!kept || at >= kept.at) kept = { board, at };
  if (here) changedHere = Math.max(changedHere, at);
}

/** Read it now (one read at a time: asking again while one is out gets that one). Null: it couldn't be read. */
export function readBoard(): Promise<TodoBoard | null> {
  if (asking) return asking;
  const at = Date.now();
  readAsked = at;
  asking = fetch("/api/todo/board", { cache: "no-store", credentials: "same-origin" })
    .then(async (r) => (r.ok ? (((await r.json()) as { board?: TodoBoard }).board ?? null) : null))
    .catch(() => null)
    .then((board) => {
      if (board) keepBoard(board, at);
      // (A change made while it was out is newer than what came back: the newest goes to whoever asked.)
      return board ? (kept?.board ?? board) : null;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** The latest: read now, unless it was read in the last `within` ms with nothing changed here since (that read's, then). */
export function freshBoard(within: number): Promise<TodoBoard | null> {
  if (asking) return asking;
  if (kept && Date.now() - readAsked < within && changedHere < readAsked) return Promise.resolve(kept.board);
  return readBoard();
}

/** Read ahead (pointing at the button, the page gone quiet) unless it was read in the last `within` ms. */
export function warmBoard(within: number) {
  void freshBoard(within);
}

/** The same to-dos, lists, pins and settings (so a newer read that brings nothing new doesn't redraw the panel). */
export const sameBoard = (a: TodoBoard, b: TodoBoard) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** (Tests.) */
export function forgetBoard() {
  kept = null;
  readAsked = 0;
  changedHere = 0;
  asking = null;
}
