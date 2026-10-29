"use client";

import { useRef, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { DocumentIcon, DownloadIcon, ExternalIcon, PaperclipIcon, TrashIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";
import { safeFileName } from "@/lib/image/compress";
import { addFile, deleteFile, fileLink } from "@/app/(dashboard)/business/actions";
import { words } from "../lib/i18n";
import type { BusinessFile } from "../lib/types";
import { useBusiness, useWords, upsert, without } from "./context";
import { quiet, secondary } from "./ui";

/*
 * Business (1.42.0): the documents behind a line or an asset (an invoice, a receipt, a bank statement, an e-Factura
 * XML): kept in the team's private folder (business-docs; only the people who see Business read them, only those who
 * edit add or remove them), opened through a link that lasts a minute. OMFP 170/2015: every entry stands on a document.
 */

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/xml,text/xml,.xml";
const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/xml", "text/xml"]);
const MAX = 20 * 1024 * 1024;

const W = words({
  onlyTypes: { en: (n: string) => `${n}: PDFs, pictures (JPEG, PNG, WebP, HEIC) and e-Factura XML only.`, ro: (n: string) => `${n}: doar PDF-uri, imagini (JPEG, PNG, WebP, HEIC) și XML e-Factura.` },
  tooBig: { en: (n: string) => `${n} is over 20 MB.`, ro: (n: string) => `${n} are peste 20 MB.` },
  uploadFailed: { en: (n: string) => `Couldn't upload ${n}. Check your connection and try again.`, ro: (n: string) => `${n} nu s-a putut încărca. Verifică conexiunea și încearcă din nou.` },
  added: { en: (n: number) => (n === 1 ? "Document added" : `${n} documents added`), ro: (n: number) => (n === 1 ? "Document adăugat" : `Documente adăugate: ${n}`) },
  openFailed: { en: "Couldn't open the file. Try again.", ro: "Fișierul nu s-a putut deschide. Încearcă din nou." },
  removeTitle: { en: (n: string) => `Remove ${n}?`, ro: (n: string) => `Ștergi ${n}?` },
  removeBody: { en: "The document goes for good. The entry stays as it is.", ro: "Documentul se șterge definitiv. Operațiunea rămâne cum e." },
  remove: { en: "Remove", ro: "Șterge" },
  cancel: { en: "Cancel", ro: "Renunță" },
  open: { en: (n: string) => `Open ${n}`, ro: (n: string) => `Deschide ${n}` },
  download: { en: (n: string) => `Download ${n}`, ro: (n: string) => `Descarcă ${n}` },
  removeIt: { en: (n: string) => `Remove ${n}`, ro: (n: string) => `Șterge ${n}` },
  none: { en: "No documents yet.", ro: "Încă niciun document." },
  uploading: { en: "Uploading…", ro: "Se încarcă…" },
  add: { en: "Add documents", ro: "Adaugă documente" },
  kinds: { en: "PDF, pictures or e-Factura XML, up to 20 MB each.", ro: "PDF, imagini sau XML e-Factura, cel mult 20 MB fiecare." },
});

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
/** A file's type, also when the browser doesn't say (HEIC, XML on some systems). */
function typeOf(f: File) {
  if (f.type && TYPES.has(f.type)) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  return ext === "heic" ? "image/heic" : ext === "heif" ? "image/heif" : ext === "xml" ? "application/xml" : ext === "pdf" ? "application/pdf" : f.type;
}

export function FilesPanel({ entryId, assetId, editable }: { entryId?: string; assetId?: string; editable: boolean }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const owner = entryId ?? assetId!;
  const files = b.s.files.filter((f) => (entryId ? f.entry_id === entryId : f.asset_id === assetId));

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const picked = Array.from(list).slice(0, 10);
    setBusy("upload");
    let added = 0;
    try {
      for (const f of picked) {
        const mime = typeOf(f);
        if (!TYPES.has(mime)) {
          toast.error(w.onlyTypes(f.name));
          continue;
        }
        if (f.size > MAX) {
          toast.error(w.tooBig(f.name));
          continue;
        }
        const path = `${b.teamId}/${owner}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(f.name)}`;
        const { error } = await createClient().storage.from("business-docs").upload(path, f, { contentType: mime, upsert: false });
        if (error) {
          toast.error(w.uploadFailed(f.name));
          continue;
        }
        const r = await addFile(b.teamId, { entryId, assetId, path, name: f.name, size: f.size, mime });
        if (r.error !== undefined) {
          toast.error(r.error);
          continue;
        }
        b.patch((s) => ({ ...s, files: upsert(s.files, r.file) }));
        added++;
      }
      if (added) toast.success(w.added(added));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function open(f: BusinessFile, download: boolean) {
    setBusy(f.id);
    try {
      const r = await fileLink(b.teamId, f.id, download);
      if (r.error !== undefined) return void toast.error(r.error);
      // A signed link from the app's own server; only a web address is opened.
      if (!/^https?:\/\//i.test(r.url)) return void toast.error(w.openFailed);
      if (download) {
        const a = document.createElement("a");
        a.href = r.url;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else window.open(r.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }

  async function remove(f: BusinessFile) {
    if (!(await confirm({ title: w.removeTitle(f.name), description: w.removeBody, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true }))) return;
    setBusy(f.id);
    try {
      const r = await deleteFile(b.teamId, f.id);
      if (r.error !== undefined) return void toast.error(r.error);
      b.patch((s) => ({ ...s, files: without(s.files, [f.id]) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {files.length ? (
        <ul className="rounded-xl border border-line/10 divide-y divide-line/10">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 px-3 py-2">
              <DocumentIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold truncate">{f.name}</span>
                <span className="block text-[11.5px] text-ink-faint">{size(f.size)}</span>
              </span>
              <button type="button" className={quiet} onClick={() => void open(f, false)} disabled={busy === f.id} aria-label={w.open(f.name)}>
                <ExternalIcon className="w-3.5 h-3.5" />
              </button>
              <button type="button" className={quiet} onClick={() => void open(f, true)} disabled={busy === f.id} aria-label={w.download(f.name)}>
                <DownloadIcon className="w-3.5 h-3.5" />
              </button>
              {editable && (
                <button type="button" className={`${quiet} hover:text-red`} onClick={() => void remove(f)} disabled={busy === f.id} aria-label={w.removeIt(f.name)}>
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-faint">{w.none}</p>
      )}
      {editable && (
        <div className="mt-2">
          <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} onChange={(e) => void upload(e.target.files)} aria-hidden />
          <button type="button" className={secondary} onClick={() => input.current?.click()} disabled={busy === "upload"}>
            <PaperclipIcon className="w-4 h-4" />
            {busy === "upload" ? w.uploading : w.add}
          </button>
          <p className="mt-1 text-[11.5px] text-ink-faint">{w.kinds}</p>
        </div>
      )}
    </div>
  );
}
