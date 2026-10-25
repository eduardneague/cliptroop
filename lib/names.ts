/** A name as it's saved (1.33.1, a video's name): runs of spaces as one, none at the ends. */
export const cleanName = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();
