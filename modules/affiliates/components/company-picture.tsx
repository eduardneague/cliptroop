"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImageIcon, LinkIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { compressImage, isPictureType, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { pictureTooBig } from "@/lib/image/limits";
import { COMPANY_PICTURE_SIZE, COMPANY_PICTURES, normalizePicture, smallPicture } from "../lib/rules";

/*
 * A company's picture, in its window (1.60.0; the owner: "add the ability to add a picture for each company too"): its
 * logo, shown where its initial was. A file (picked, or dropped on the box) is made small here (256 px at most, its
 * see-through parts kept) and goes up to the team's own folder (migration 0139: only the people who manage
 * sponsorships may); or a picture's link, as a product's. Saved with the window; an upload that isn't kept is removed
 * (the window tells the server, discardCompanyPictures).
 */

const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const SMALL = "inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold border border-line/15 text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50 whitespace-nowrap";

export function CompanyPicture({
  teamId,
  value,
  onChange,
  input,
}: {
  teamId: string;
  value: string | null;
  /** A new picture (uploaded: true when it's a file that went up just now), or none. */
  onChange: (url: string | null, uploaded?: boolean) => void;
  /** The text field's classes (the window's). */
  input: string;
}) {
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [typed, setTyped] = useState("");
  const [broken, setBroken] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (pasting) requestAnimationFrame(() => linkRef.current?.focus());
  }, [pasting]);

  async function upload(original: File | undefined) {
    if (!original || busy) return;
    setProblem(null);
    if (!isPictureType(original.type) && original.type !== "image/svg+xml") return setProblem("Use a picture: PNG, JPG, WebP or GIF.");
    const tooBig = pictureTooBig(original);
    if (tooBig) return setProblem(tooBig);
    setBusy(true);
    try {
      const small = await compressImage(original, COMPANY_PICTURE_SIZE);
      if (!TYPES.includes(small.type)) return setProblem("That kind of picture can't go up here. Use a PNG, JPG, WebP or GIF.");
      const ext = small.type === "image/png" ? "png" : small.type === "image/jpeg" ? "jpg" : small.type === "image/gif" ? "gif" : "webp";
      const path = `${teamId}/${crypto.randomUUID()}.${ext}`;
      const storage = createClient().storage.from(COMPANY_PICTURES);
      const { error } = await storage.upload(path, small, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: small.type });
      if (error) return setProblem(/row-level|policy|unauthor|permission/i.test(error.message) ? "You can't add pictures here: ask a Master to let you manage sponsorships." : "Couldn't upload it. Try again.");
      onChange(storage.getPublicUrl(path).data.publicUrl, true);
    } catch {
      setProblem("Couldn't upload it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function takeLink() {
    const url = normalizePicture(typed);
    if (!url) return setProblem("That isn't a picture on the web (https://…). On the brand's page: right-click its logo, Copy image address.");
    onChange(url);
    setPasting(false);
    setTyped("");
    setProblem(null);
  }

  const shown = value && broken !== value ? value : null;
  return (
    <div>
      <span id={`${id}-label`} className="block text-[12.5px] font-semibold text-ink-soft mb-1.5">
        Picture
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => file.current?.click()}
          onDragOver={(e) => {
            if (![...e.dataTransfer.items].some((i) => i.kind === "file")) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          title="Upload a picture (or drop one here)"
          className={`relative w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
            over ? "ring-2 ring-amber bg-amber/10" : shown ? "bg-white ring-1 ring-inset ring-line/10" : "border border-dashed border-line/30 text-ink-faint hover:text-ink hover:border-line/50"
          }`}
        >
          {busy ? (
            <span className="w-full h-full bg-surface-2 animate-pulse" aria-hidden />
          ) : shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={smallPicture(shown, 112)} alt="The company's picture" referrerPolicy="no-referrer" onError={() => setBroken(shown)} className="w-full h-full object-contain p-1" data-company-picture-preview="" />
          ) : (
            <ImageIcon className="w-5 h-5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          {pasting ? (
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-link`} className="sr-only">
                The picture&rsquo;s link
              </label>
              <input
                ref={linkRef}
                id={`${id}-link`}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setProblem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setPasting(false);
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    takeLink();
                  }
                }}
                inputMode="url"
                placeholder="https://… (right-click the logo, Copy image address)"
                className={`${input} h-9 text-[13px]`}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" onClick={takeLink} className="rounded-lg px-3 h-9 text-[12.5px] font-bold bg-amber text-white whitespace-nowrap">
                Use it
              </button>
              <button type="button" onClick={() => setPasting(false)} className="rounded-lg px-2 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => file.current?.click()} disabled={busy} className={SMALL}>
                <UploadIcon className="w-3.5 h-3.5" />
                {busy ? "Uploading…" : value ? "Upload another" : "Upload a picture"}
              </button>
              <button type="button" onClick={() => setPasting(true)} disabled={busy} className={SMALL}>
                <LinkIcon className="w-3.5 h-3.5" />
                Paste a link
              </button>
              {value && (
                <button type="button" onClick={() => onChange(null)} disabled={busy} className={`${SMALL} hover:!text-red`} aria-label="Remove the picture">
                  <TrashIcon className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>
          )}
          <p id={`${id}-hint`} className={`mt-1.5 text-[12px] ${problem ? "text-red" : "text-ink-faint"}`} role={problem ? "alert" : undefined}>
            {problem ?? (value && broken === value ? "That picture doesn't open here. Upload one, or paste another link." : "Its logo: it shows instead of the letter. A file, or a picture's link.")}
          </p>
        </div>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
