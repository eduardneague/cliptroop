/**
 * Screen widths where the layout changes (Tailwind's sm / md / lg / xl / 2xl).
 * One list for the styles (tailwind.config.ts) and for code that asks the
 * browser (matchMedia), so both always switch at the same width.
 *
 * Since 1.9.6 md / lg / xl / 2xl switch earlier than Tailwind's defaults
 * (768 / 1024 / 1280 / 1536): the sidebar takes 236px from md up, so the
 * pages got cramped on laptops and small windows before they changed.
 */
export const BREAKPOINTS = {
  sm: 640,
  /** The sidebar appears (below: top bar + bottom tabs). */
  md: 900,
  lg: 1180,
  xl: 1400,
  "2xl": 1600,
} as const;

export const minWidth = (bp: keyof typeof BREAKPOINTS) => `(min-width: ${BREAKPOINTS[bp]}px)`;
export const belowWidth = (bp: keyof typeof BREAKPOINTS) => `(max-width: ${BREAKPOINTS[bp] - 1}px)`;
