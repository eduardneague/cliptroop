/**
 * Pictures that come into a script (1.27.5): pasted screenshots and copied
 * pictures (files on the clipboard; some browsers only list them as items),
 * pictures inside copied text (Word, Google Docs and Firefox put them in as
 * data: links, which never saved), and dropped files. Each one shows at once
 * from the device (a blob: link) and is uploaded in the background; the
 * script is only saved once it has the picture's real address
 * (components/use-script-images.ts). The decisions are pure:
 * tests/paste-images.test.ts.
 */

/** Image files on the clipboard or in a drop (files and file items, each once). */
export function imageFiles(dt: Pick<DataTransfer, "files" | "items"> | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  const seen = new Set<string>();
  const add = (f: File | null | undefined) => {
    if (!f || !f.type?.startsWith("image/")) return;
    const key = `${f.name}|${f.size}|${f.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  for (const f of Array.from(dt.files ?? [])) add(f);
  for (const it of Array.from(dt.items ?? [])) if (it.kind === "file") add(it.getAsFile());
  return out;
}

/** The words in what's pasted (the HTML's text when there is HTML). */
export function pastedWords(html: string, text: string): string {
  if (html.trim()) {
    return html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
      .replace(/&[a-z]+;|&#\d+;/gi, "x")
      .replace(/\s+/g, " ")
      .trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Pictures in the HTML the page can show (a web address or the picture itself). */
export const LOADABLE_IMG = /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:|data:image\/)/i;

/**
 * What a paste does: "files" = it's only pictures (a screenshot, a copied
 * picture): they go in, nothing else; "files-after" = text and pictures that
 * only came as files (Word): the text goes in as usual, the pictures after
 * it; "default" = the editor pastes it (pictures inside are handled while
 * it reads the HTML).
 */
export function pastePlan(p: { files: number; html: string; text: string }): "files" | "files-after" | "default" {
  if (!p.files) return "default";
  if (!pastedWords(p.html, p.text)) return "files";
  return LOADABLE_IMG.test(p.html) ? "default" : "files-after";
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp", "image/svg+xml": "svg", "image/avif": "avif" };

/** A data: picture as bytes and a type (null when it isn't one, or is too big). */
export function decodeDataImage(src: string, maxBytes = 25 * 1024 * 1024): { type: string; bytes: Uint8Array; ext: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+)(?:;[a-z0-9=._-]+)*?(;base64)?,([\s\S]*)$/i.exec(src.trim());
  if (!m) return null;
  const type = m[1].toLowerCase();
  // Rough size first (4 base64 characters are 3 bytes).
  if ((m[2] ? (m[3].length * 3) / 4 : m[3].length) > maxBytes) return null;
  try {
    let bytes: Uint8Array;
    if (m[2]) {
      const bin = atob(m[3].replace(/\s+/g, ""));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
    if (!bytes.length) return null;
    return { type, bytes, ext: EXT[type] ?? "png" };
  } catch {
    return null;
  }
}

/** A picture address that can't be kept: the device's own files, another page's blob: links. */
export const unkeepableSrc = (src: string) => /^\s*(file:|blob:|about:|cid:|webkit-fake-url:)/i.test(src);

type Json = { type: string; attrs?: Record<string, unknown>; content?: Json[]; [k: string]: unknown };

/**
 * The document as it's saved: pictures still uploading → null (wait and try
 * again); uploaded ones with their real address; any other blob: picture
 * (it can't be saved) left out.
 *
 * Always a plain copy (1.27.5): the editor's own JSON has its attributes in
 * objects without a prototype (ProseMirror's), and a Server Action can't
 * send those: React silently sent them as "temporary references", so every
 * save lost every attribute (pictures their address, links where they go,
 * headings their size, highlights their colour, lists their numbering).
 */
export function readyToSave<T extends Json>(doc: T, uploaded: ReadonlyMap<string, string>, uploading: ReadonlySet<string>): T | null {
  let wait = false;
  const walk = (n: Json): Json | null => {
    if (n.type === "image") {
      const src = typeof n.attrs?.src === "string" ? n.attrs.src : "";
      if (src.startsWith("blob:")) {
        const real = uploaded.get(src);
        if (real) return { ...n, attrs: { ...n.attrs, src: real } };
        if (uploading.has(src)) wait = true;
        return uploading.has(src) ? n : null;
      }
      return n;
    }
    if (!n.content) return n;
    return { ...n, content: n.content.map(walk).filter((x): x is Json => x !== null) };
  };
  const out = walk(doc);
  return wait ? null : (JSON.parse(JSON.stringify(out)) as T);
}
