// 1.55.8: the owner, Nov 20 2026 (13:30): "how come the my day widget loads instantly but the one in the top bar loads
// really slowly?". The dashboard's widget comes with the page's data. The top bar's panel, on every open, first loaded
// its own code (next/dynamic: its placeholder is always drawn first, and React keeps a placeholder up for 300 ms), then
// read your whole To Do through a server action (they go one at a time, behind the page's other calls), behind a
// skeleton, and forgot it when it closed. Now: your To Do as last seen in this tab is kept (lib/board-cache.ts: the
// dashboard's widget and To Do give theirs, every change made anywhere keeps it current, each read too), the panel
// opens with it at once and reads the latest from GET /api/todo/board meanwhile; the code and your To Do are fetched
// ahead (pointing at the button; the page gone quiet, for someone who uses it).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { forgetBoard, freshBoard, keepBoard, keptBoard, readBoard, sameBoard, warmBoard } from "../modules/todo/lib/board-cache";
import type { TodoBoard } from "../modules/todo/lib/model";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const board = (title: string): TodoBoard => ({ lists: [], todos: [{ id: title, title } as TodoBoard["todos"][number]], pins: [], prefs: {} as TodoBoard["prefs"], ready: true });
let reads = 0;
let answer: TodoBoard | null = board("server");
let hold: Promise<void> = Promise.resolve();
(globalThis as { fetch: unknown }).fetch = async (url: string) => {
  reads++;
  ok(url === "/api/todo/board", `it reads from the route (${url})`);
  await hold;
  return answer ? { ok: true, json: async () => ({ board: answer }) } : { ok: false, json: async () => ({ error: "no" }) };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

void (async () => {
  // ---- what's kept --------------------------------------------------------------------------------------------------
  forgetBoard();
  ok(keptBoard() === null, "nothing kept to begin with");
  keepBoard(board("page"), 0);
  ok(keptBoard()?.board.todos[0].id === "page", "a page's board is kept (when there's none: as old)");
  keepBoard(board("older"), -1);
  ok(keptBoard()?.board.todos[0].id === "page", "an older one doesn't replace a newer one");

  // ---- reading -------------------------------------------------------------------------------------------------------
  reads = 0;
  const one = readBoard();
  const two = readBoard();
  ok(one === two, "asking again while a read is out gets that read (one at a time)");
  ok((await one)?.todos[0].id === "server" && keptBoard()?.board.todos[0].id === "server" && reads === 1, "a read is kept, once");
  ok((await freshBoard(5_000))?.todos[0].id === "server" && reads === 1, "just read, nothing changed here: the kept one, no second read");
  warmBoard(15_000);
  await tick();
  ok(reads === 1, "pointing at the button right after a read: no read");

  await new Promise((r) => setTimeout(r, 5));
  keepBoard(board("added here"), Date.now(), true);
  await new Promise((r) => setTimeout(r, 5));
  answer = board("server, with it");
  ok((await freshBoard(5_000))?.todos[0].id === "server, with it" && reads === 2, "a change made here since: read again (one still on its way shows with it)");

  // A change made while a read is out isn't undone by that read.
  let let_go: () => void = () => {};
  hold = new Promise((r) => (let_go = r));
  answer = board("server, before the change");
  const out = readBoard();
  await tick();
  keepBoard(board("changed meanwhile"), Date.now() + 5, true);
  let_go();
  ok((await out)?.todos[0].id === "changed meanwhile" && keptBoard()?.board.todos[0].id === "changed meanwhile", "a read asked before a change made here doesn't undo it (the newest goes to whoever asked)");
  hold = Promise.resolve();

  answer = null;
  forgetBoard();
  ok((await readBoard()) === null && keptBoard() === null, "a read that fails: nothing (and nothing kept)");
  ok(sameBoard(board("a"), board("a")) && !sameBoard(board("a"), board("b")), "the same board: nothing redrawn");

  // ---- the route --------------------------------------------------------------------------------------------------------
  const route = read("app/api/todo/board/route.ts");
  ok(/export async function GET\(\)/.test(route) && /const user = await getCachedUser\(\);\s*if \(!user\) return Response\.json\(\{ error: "Sign in first\." \}, \{ status: 401, headers: NO_STORE \}\);/.test(route), "GET /api/todo/board: yours, signed in");
  ok(/const board = await loadTodoBoard\(\{ done: 60 \}\);\s*return Response\.json\(\{ board \}, \{ headers: NO_STORE \}\);/.test(route) && /"Cache-Control": "private, no-store"/.test(route), "the same board the panel had, never kept by a cache on the way");
  ok(!/export async function readTodoBoard/.test(read("modules/todo/actions.ts")), "no server action for it any more");

  // ---- the panel ---------------------------------------------------------------------------------------------------------
  const panel = read("modules/todo/components/quick-todo-panel.tsx");
  ok(/useState<\{ board: TodoBoard; n: number \} \| null>\(\(\) => \{\s*const k = keptBoard\(\);\s*return k \? \{ board: k\.board, n: 0 \} : null;/.test(panel), "it opens with what's kept, at once");
  ok(/void freshBoard\(5_000\)\.then/.test(panel), "and reads the latest meanwhile (not twice in 5 s)");
  ok(/setShown\(\(s\) => \(s && \(touched\.current \|\| sameBoard\(s\.board, board\)\) \? s : \{ board, n: \(s\?\.n \?\? 0\) \+ 1 \}\)\)/.test(panel), "the latest replaces it only if it's different and you haven't started on the panel");
  ok(/onPointerDownCapture=\{\(\) => \(touched\.current = true\)\} onKeyDownCapture=\{\(\) => \(touched\.current = true\)\}/.test(panel), "anything done there counts (a tab, a letter typed)");
  ok(/if \(!board\) return void \(hadOne\.current \|\| setFailed\(true\)\);/.test(panel), "a failed read only says so when there was nothing to show");
  ok(/if \(!shown\) return <QuickTodoLoading \/>;/.test(panel), "nothing kept: it waits for the read");

  // ---- the button ---------------------------------------------------------------------------------------------------------
  const quick = read("modules/todo/components/quick-todo.tsx");
  ok(!/from "next\/dynamic"/.test(quick) && /const loadPanel = \(\) => import\("\.\/quick-todo-panel"\)\.then\(\(m\) => \(mod = m\)\);/.test(quick), "its inside: in a file of its own (with the kept To Do: not on every page)");
  ok(/const \[m, setM\] = useState\(\(\) => mod\);/.test(quick) && /if \(m\) return <m\.default onClose=\{onClose\} \/>;/.test(quick), "loaded ahead: drawn at once, no placeholder (next/dynamic's was kept up 300 ms)");
  ok(/const warm = \(within: number\) => void loadPanel\(\)\.then\(\(m\) => m\.warmBoard\(within\)\);/.test(quick) && read("modules/todo/components/quick-todo-panel.tsx").includes('export { warmBoard } from "../lib/board-cache";'), "reading ahead goes through the inside (it brings the kept To Do)");
  ok(/onPointerEnter=\{ahead\}/.test(quick) && /onFocus=\{ahead\}/.test(quick) && /const ahead = \(\) => warm\(15_000\);/.test(quick), "pointing at it (or tabbing to it): the inside and your To Do, ahead");
  ok(/const ahead = \(\) => \(store\(\) \? warm\(60_000\) : void loadPanel\(\)\);/.test(quick) && /requestIdleCallback\(ahead, \{ timeout: 5000 \}\)/.test(quick) && /window\.setTimeout\(ahead, 1500\)/.test(quick), "the page gone quiet: the inside; your To Do too if you use it here (Safari: a moment after)");
  ok(/useEffect\(\(\) => void \(open && store\(true\)\), \[open\]\);/.test(quick) && /const USED = "vp:quick-todo-used";/.test(quick), "opening it marks this browser as one that uses it");

  // ---- the store keeps it current ------------------------------------------------------------------------------------------
  const store = read("modules/todo/components/use-todo-store.ts");
  ok(/if \(!keptBoard\(\)\) keepBoard\(initial, 0\);/.test(store), "the board a page came with (the dashboard's widget, To Do), when nothing's kept: as old");
  ok(/keepBoard\(\{ lists, todos: todos\.filter\(\(t\) => !t\.id\.startsWith\("tmp-"\) && !leaving\.has\(t\.id\)\), pins, prefs, ready \}, Date\.now\(\), true\);/.test(store), "then every change made, as a change made here (not the ones still on their way, nor going with Undo)");

  if (fails) {
    console.log(`${fails} failed`);
    process.exit(1);
  }
  console.log("1.55.8 fixes ok");
})();
