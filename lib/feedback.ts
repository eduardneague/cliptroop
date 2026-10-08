/*
 * Bug reports and suggestions (1.9.9): the limits the form, the server
 * action and the database (0068) share. Safe to use in the browser.
 */

export type FeedbackKind = "bug" | "idea";

export const FEEDBACK_MAX_CHARS = 500;
export const FEEDBACK_MIN_CHARS = 10;
export const FEEDBACK_MAX_FILES = 3;
/** 25 MB a file (the "feedback" bucket refuses anything bigger). */
export const FEEDBACK_MAX_BYTES = 25 * 1024 * 1024;
export const FEEDBACK_BUCKET = "feedback";

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = { bug: "Bug report", idea: "Suggestion" };

/** Why a file can't be added, or null when it can. */
export function feedbackFileProblem(file: { name: string; type: string; size: number }): string | null {
  const media = /^(image|video)\//.test(file.type) || /\.(png|jpe?g|gif|webp|heic|heif|avif|mp4|mov|m4v|webm)$/i.test(file.name);
  if (!media) return `${file.name} isn't a photo or a video.`;
  if (file.size > FEEDBACK_MAX_BYTES) return `${file.name} is ${mb(file.size)}. Each file can be up to 25 MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** 1.4 MB, 820 KB. */
export function mb(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** A storage-safe file name: letters, digits, dots, dashes (keeps the extension). */
export function safeFileName(raw: string) {
  const name = raw.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}
