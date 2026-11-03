/** A file with a coloured tag: PDF red, Word blue (1.38.0, the shorts list's exports). */
export function FileTypeIcon({ kind, className }: { kind: "pdf" | "docx"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <rect x="2.5" y="12.5" width="11" height="6.5" rx="1.6" fill={kind === "pdf" ? "rgb(var(--red))" : "rgb(var(--blue))"} stroke="none" />
    </svg>
  );
}
