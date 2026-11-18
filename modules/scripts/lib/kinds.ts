/*
 * What's left on a script's words (1.54.0: three kinds): a comment (the accent), an editing idea (blue) and a frame
 * guide (Frame Guides' colour, --frame: teal, or violet beside a teal or green accent). One colour per kind,
 * everywhere: the words' highlight, the faces in the margin, the cards, the composer. Pure.
 */

export type CommentKind = "comment" | "edit_idea" | "frame";
export const COMMENT_KINDS: CommentKind[] = ["comment", "edit_idea", "frame"];

export const KIND_COLOR: Record<CommentKind, string> = { comment: "rgb(var(--amber))", edit_idea: "rgb(59 130 246)", frame: "rgb(var(--frame))" };
export const KIND_LABEL: Record<CommentKind, string> = { comment: "Comment", edit_idea: "Editing idea", frame: "Frame guide" };
/** In a sentence: "a comment", "an editing idea", "a frame guide". */
export const KIND_WORDS: Record<CommentKind, string> = { comment: "a comment", edit_idea: "an editing idea", frame: "a frame guide" };

export const asKind = (k: unknown): CommentKind => (k === "edit_idea" || k === "frame" ? k : "comment");

/** A frame guide's frame, as a script shows it (its picture, number and name; null when it was deleted). */
export type FrameRef = {
  id: string;
  number: number;
  title: string;
  url: string;
  thumb: string;
  w: number;
  h: number;
  tint: string | null;
  collection: { name: string; color: string } | null;
};

/** "#12 · Over the shoulder", or "Frame #12". */
export const frameRefName = (f: { number: number; title: string }) => (f.title.trim() ? `#${f.number} · ${f.title.trim()}` : `Frame #${f.number}`);
