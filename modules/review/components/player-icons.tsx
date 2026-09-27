/**
 * VPlanner's own player icons: soft, rounded, a little chunky, to match
 * the rest of the app (not the browser's default look).
 */
type P = { className?: string };
const base = { viewBox: "0 0 24 24", "aria-hidden": true as const };

export function PlayIcon({ className }: P) {
  return (
    <svg {...base} className={className} fill="currentColor">
      <path d="M8.2 4.6c-.9-.55-2.05.1-2.05 1.15v12.5c0 1.05 1.15 1.7 2.05 1.15l10.1-6.25c.85-.52.85-1.78 0-2.3L8.2 4.6Z" />
    </svg>
  );
}
export function PauseIcon({ className }: P) {
  return (
    <svg {...base} className={className} fill="currentColor">
      <rect x="6.2" y="4.8" width="4.2" height="14.4" rx="1.9" />
      <rect x="13.6" y="4.8" width="4.2" height="14.4" rx="1.9" />
    </svg>
  );
}
/** One frame back: a small bar + a soft triangle. */
export function FrameBackIcon({ className }: P) {
  return (
    <svg {...base} className={className} fill="currentColor">
      <rect x="5" y="6" width="2.6" height="12" rx="1.3" />
      <path d="M17.6 6.9c0-.9-1-1.45-1.75-.95l-6.1 4.1a1.15 1.15 0 0 0 0 1.9l6.1 4.1c.75.5 1.75-.05 1.75-.95V6.9Z" />
    </svg>
  );
}
export function FrameForwardIcon({ className }: P) {
  return (
    <svg {...base} className={className} fill="currentColor">
      <rect x="16.4" y="6" width="2.6" height="12" rx="1.3" />
      <path d="M6.4 6.9c0-.9 1-1.45 1.75-.95l6.1 4.1a1.15 1.15 0 0 1 0 1.9l-6.1 4.1c-.75.5-1.75-.05-1.75-.95V6.9Z" />
    </svg>
  );
}
/** Jump back / forward 5 seconds: a rounded arrow around a "5". */
export function Back5Icon({ className }: P) {
  return (
    <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.2 3.8v3.4h3.4" />
      <text x="12" y="15.4" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="currentColor" stroke="none">5</text>
    </svg>
  );
}
export function Forward5Icon({ className }: P) {
  return (
    <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.8v3.4h-3.4" />
      <text x="12" y="15.4" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="currentColor" stroke="none">5</text>
    </svg>
  );
}
export function SoundIcon({ className, muted }: P & { muted?: boolean }) {
  return (
    <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 9.6c0-.6.5-1.1 1.1-1.1h2.6l4-3.2c.7-.55 1.7-.05 1.7.85v11.7c0 .9-1 1.4-1.7.85l-4-3.2H5.6c-.6 0-1.1-.5-1.1-1.1V9.6Z" fill="currentColor" stroke="none" />
      {muted ? <path d="m17.2 9.6 4.3 4.8M21.5 9.6l-4.3 4.8" /> : <path d="M17.3 9a4.2 4.2 0 0 1 0 6M19.6 6.6a7.6 7.6 0 0 1 0 10.8" />}
    </svg>
  );
}
export function ExpandIcon2({ className }: P) {
  return (
    <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 9V6.5a2 2 0 0 1 2-2H9M19.5 9V6.5a2 2 0 0 0-2-2H15M4.5 15v2.5a2 2 0 0 0 2 2H9M19.5 15v2.5a2 2 0 0 1-2 2H15" />
    </svg>
  );
}
