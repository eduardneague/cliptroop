/**
 * Script comments' sizes (1.50.0), the same as the database's (0127): a quote may run over several lines and
 * paragraphs, up to 4,000 characters ("" for a general comment, on the whole document); the words up to 2,000.
 */
export const MAX_QUOTE = 4000;
export const MAX_COMMENT = 2000;

/**
 * What stands for a line break, a picture or any other thing inside a paragraph in a quote that goes over one (1.53.3,
 * lib/anchors.ts): U+FFFC, the "object here" character. It was "\u0000", which the database can't store (PostgreSQL:
 * "unsupported Unicode escape sequence"), so every comment and editing idea on words over a line break failed (the
 * owner, Nov 17 2026: "Couldn't add the idea with its sketch (unsupported Unicode escape sequence)"). None was ever
 * saved with it, so no saved quote changes.
 */
export const LEAF = "\uFFFC";
/** A quote written the old way ("\u0000" for a line break, by a page loaded before 1.53.3) as it's read now. */
export const toLeaf = (quote: string) => quote.replace(/\u0000/g, LEAF);
