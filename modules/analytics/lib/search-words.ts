/**
 * The words of a search, each to be found in a title (1.22.0): "what your
 * phone says about you 14" finds "What Your Phone Says About You #14" (the
 * whole phrase had to appear as typed, so a # or a dash in the title hid it).
 */
export function searchWords(q: string): string[] {
  // (Apostrophes split words too: "don't" typed finds "Don’t". One letter alone says little: left out, numbers kept.)
  const words = q
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 || /\d/.test(w));
  return [...new Set(words)].slice(0, 8);
}
