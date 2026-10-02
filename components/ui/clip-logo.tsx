/**
 * The VPlanner logo: Clip's face (the mascot, cropped to the board) —
 * static, so it reads at small sizes. Hovering the brand row claps the
 * clapper once (CSS: .brand-row:hover .clip-logo-arm).
 * Same drawing as app/icon.svg (the browser tab icon).
 */
const INK = "#2B2118";
const CREAM = "#FFF4E6";
const AMBER = "#E8630D";

function Stripes({ y, h }: { y: number; h: number }) {
  return (
    <>
      {Array.from({ length: 7 }, (_, k) => {
        const x = 22 + k * 11;
        return <polygon key={k} points={`${x},${y + h} ${x + 6},${y} ${x + 12},${y} ${x + 6},${y + h}`} fill={AMBER} />;
      })}
    </>
  );
}

export function ClipLogo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="18 20 84 84" width={size} height={size} className={`clip-logo flex-shrink-0 ${className}`} role="img" aria-label="VPlanner">
      <defs>
        <clipPath id="clip-logo-board">
          <rect x="30" y="50" width="60" height="50" rx="10" />
        </clipPath>
        <clipPath id="clip-logo-arm">
          <rect x="29" y="38" width="62" height="10" rx="3" />
        </clipPath>
      </defs>
      <rect x="30" y="50" width="60" height="50" rx="10" fill={CREAM} stroke={CREAM} strokeWidth="6" />
      <g clipPath="url(#clip-logo-board)">
        <rect x="28" y="50" width="64" height="11" fill={INK} />
        <Stripes y={50} h={11} />
      </g>
      <rect x="30" y="50" width="60" height="50" rx="10" fill="none" stroke={INK} strokeWidth="3.4" />
      <ellipse cx="40" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.65" />
      <ellipse cx="80" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.65" />
      <ellipse cx="48" cy="77" rx="3.6" ry="4.6" fill={INK} />
      <ellipse cx="72" cy="77" rx="3.6" ry="4.6" fill={INK} />
      <circle cx="49.2" cy="75.4" r="1.3" fill="#fff" />
      <circle cx="73.2" cy="75.4" r="1.3" fill="#fff" />
      <path d="M54.5 86 Q60 91 65.5 86" fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
      <g className="clip-logo-arm" style={{ transformBox: "view-box", transformOrigin: "31px 48px" }}>
        <rect x="29" y="38" width="62" height="10" rx="3" fill={INK} stroke={CREAM} strokeWidth="5" />
        <g clipPath="url(#clip-logo-arm)">
          <Stripes y={38} h={10} />
        </g>
        <rect x="29" y="38" width="62" height="10" rx="3" fill="none" stroke={INK} strokeWidth="2.8" />
        <circle cx="33" cy="48" r="2.4" fill={CREAM} stroke={INK} strokeWidth="1.8" />
      </g>
    </svg>
  );
}

/** Clip + the wordmark. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-row inline-flex items-center gap-2 ${className}`}>
      <ClipLogo size={28} />
      <span className="font-display font-semibold text-[16px] tracking-tight">VPlanner</span>
    </span>
  );
}
