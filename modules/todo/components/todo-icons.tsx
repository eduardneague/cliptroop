/** To Do's own icons (1.53.0), here rather than in components/ui/icons.tsx, which every page loads. */
const svg = (className: string | undefined, children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {children}
  </svg>
);

/** Repeats: two arrows chasing each other round. */
export const RepeatIcon = ({ className }: { className?: string }) =>
  svg(
    className,
    <>
      <path d="M17 2.75 20.25 6 17 9.25" />
      <path d="M3.75 11.25V10a4 4 0 0 1 4-4h12.5" />
      <path d="M7 21.25 3.75 18 7 14.75" />
      <path d="M20.25 12.75V14a4 4 0 0 1-4 4H3.75" />
    </>
  );

/** Sort: arrows up and down. */
export const SortIcon = ({ className }: { className?: string }) => svg(className, <path d="M7.5 4v16M4 7.5 7.5 4 11 7.5M16.5 20V4M13 16.5l3.5 3.5 3.5-3.5" />);
