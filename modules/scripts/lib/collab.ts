import type { Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Step, type Transform } from "@tiptap/pm/transform";
import { ANY_EDIT } from "./anchors";

/*
 * Writing a script together, live (1.55.0): the page's side. ProseMirror's central-authority way of sharing one
 * document (the prosemirror-collab algorithm, MIT, written out here: the package isn't in this app's dependencies):
 *
 *   * the page keeps the script's version (how many steps the database has taken) and its own steps the database
 *     hasn't confirmed yet;
 *   * it sends those with the version they were made on (use-live-edits.ts → script_live_push, 0134); if the script
 *     moved on meanwhile, it takes the steps it hadn't seen and moves its own over them (rebase), then sends again;
 *   * steps from the others are put in as they come, with the page's own still-unconfirmed ones moved over them.
 *
 * Every page ends with the same document, step for step. Undo only undoes your own changes (prosemirror-history is
 * told what was moved: historyPreserveItems, "rebased"). Pure: tests/live-edits.test.ts runs many pages against one
 * database in Node.
 */

export class Rebaseable {
  constructor(
    readonly step: Step,
    readonly inverted: Step,
    readonly origin: Transform
  ) {}
}

/** Steps `steps` moved over `over` (both put into `tr`): the ones that still apply, with their new inverses. */
export function rebaseSteps(steps: readonly Rebaseable[], over: readonly Step[], tr: Transform): Rebaseable[] {
  for (let i = steps.length - 1; i >= 0; i--) tr.step(steps[i].inverted);
  for (const s of over) tr.step(s);
  const out: Rebaseable[] = [];
  for (let i = 0, mapFrom = steps.length; i < steps.length; i++) {
    const mapped = steps[i].step.map(tr.mapping.slice(mapFrom));
    mapFrom--;
    if (mapped && !tr.maybeStep(mapped).failed) {
      // (In prosemirror-transform, not in its types: how prosemirror-collab ties a step to its inverse.)
      (tr.mapping as unknown as { setMirror(n: number, m: number): void }).setMirror(mapFrom, tr.steps.length - 1);
      out.push(new Rebaseable(mapped, mapped.invert(tr.docs[tr.docs.length - 1]), steps[i].origin));
    }
  }
  return out;
}

export class CollabState {
  constructor(
    readonly version: number,
    readonly unconfirmed: readonly Rebaseable[]
  ) {}
}

function unconfirmedFrom(tr: Transform): Rebaseable[] {
  const out: Rebaseable[] = [];
  for (let i = 0; i < tr.steps.length; i++) out.push(new Rebaseable(tr.steps[i], tr.steps[i].invert(tr.docs[i]), tr));
  return out;
}

export const collabKey = new PluginKey<CollabState>("vp-collab");

/** The plugin: the script's version, and this page's steps not confirmed yet. `client`: this page's id. */
export function collab(config: { version: number; client: string }): Plugin<CollabState> {
  return new Plugin<CollabState>({
    key: collabKey,
    state: {
      init: () => new CollabState(config.version, []),
      apply(tr, state) {
        const next = tr.getMeta(collabKey) as CollabState | undefined;
        if (next) return next;
        if (tr.docChanged) return new CollabState(state.version, state.unconfirmed.concat(unconfirmedFrom(tr)));
        return state;
      },
    },
    // prosemirror-history keeps what it needs to move undo steps over the others' changes.
    historyPreserveItems: true,
    // (Read back by receive, below.)
    client: config.client,
  } as ConstructorParameters<typeof Plugin<CollabState>>[0]);
}

const clientOf = (state: EditorState) => (collabKey.get(state)?.spec as unknown as { client: string }).client;

/** The script's version this page is at. */
export const versionOf = (state: EditorState) => collabKey.getState(state)?.version ?? 0;

/** This page's steps waiting to be sent: with the version they're made on. Null: nothing waiting. */
export function sendable(state: EditorState): { version: number; steps: Step[]; client: string } | null {
  const s = collabKey.getState(state);
  if (!s || !s.unconfirmed.length) return null;
  return { version: s.version, steps: s.unconfirmed.map((u) => u.step), client: clientOf(state) };
}

/**
 * Steps the database took (anyone's, in its order), as a transaction for this page: its own among them (at the front,
 * by `clients`) are confirmed; the others' are put in, this page's unconfirmed ones moved over them. Never undone by
 * this page's undo; never turned down as an edit of commented words (that rule was kept where they were made).
 */
export function receive(state: EditorState, steps: readonly Step[], clients: readonly string[]): Transaction {
  const s = collabKey.getState(state)!;
  const version = s.version + steps.length;
  const me = clientOf(state);
  let ours = 0;
  while (ours < clients.length && clients[ours] === me) ours++;
  let unconfirmed = s.unconfirmed.slice(ours);
  const theirs = ours ? steps.slice(ours) : steps;
  if (!theirs.length) return state.tr.setMeta(collabKey, new CollabState(version, unconfirmed));
  const n = unconfirmed.length;
  const tr = state.tr;
  if (n) unconfirmed = rebaseSteps(unconfirmed, theirs, tr);
  else {
    for (const st of theirs) tr.step(st);
    unconfirmed = [];
  }
  return (
    tr
      .setMeta("rebased", n)
      .setMeta("addToHistory", false)
      .setMeta(ANY_EDIT, true)
      // Nothing added to them on every page at once (a link made of typed words, an empty line at the end, a cleared
      // page): whoever made the change added it already, and it comes with their steps.
      .setMeta("preventAutolink", true)
      .setMeta("skipTrailingNode", true)
      .setMeta("preventClearDocument", true)
      .setMeta(collabKey, new CollabState(version, unconfirmed))
  );
}

/** Steps as they're sent and stored (JSON), and back; null when one can't be read here (a newer page's). */
export const stepsToJson = (steps: readonly Step[]) => steps.map((s) => s.toJSON() as unknown);
export function stepsFromJson(schema: Schema, json: unknown): Step[] | null {
  if (!Array.isArray(json)) return null;
  try {
    return json.map((j) => Step.fromJSON(schema, j));
  } catch {
    return null;
  }
}

/** A page's id: random, for this tab (the database keeps which page made each step). */
export function newClientId(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return `p${Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20)}`;
}
