"use client";

import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import { useId } from "react";

/**
 * Clippy, VPlanner's mascot: a little clapperboard (called Clip until 1.5).
 *   celebrate: hops, claps, waves, throws confetti, then idles happily
 *   idle: breathes, blinks, claps now and then
 * Drawn in SVG, animated in CSS (globals.css, "Mascot"), so it follows the
 * animations setting. Fixed colours: it looks the same in light and dark.
 */
export type MascotMood = "celebrate" | "idle";

const INK = "#2B2118";
const CREAM = "#FFF4E6";
const AMBER = "#E8630D";
const CONFETTI = ["#E8630D", "#22C55E", "#3B82F6", "#EAB308", "#EC4899", "#14B8A6"];

/** Diagonal stripes for the clapper (parallelograms), clipped by the caller. */
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

export function Mascot({ mood = "idle", size = 96, className = "" }: { mood?: MascotMood; size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const happy = mood === "celebrate";
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`mascot mascot-${mood} ${className}`} role="img" aria-label={happy ? `${MASCOT_NAME}, the ${APP_NAME} clapperboard, celebrating` : `${MASCOT_NAME}, the ${APP_NAME} clapperboard`}>
      <defs>
        <clipPath id={`${id}-board`}>
          <rect x="30" y="50" width="60" height="50" rx="10" />
        </clipPath>
        <clipPath id={`${id}-arm`}>
          <rect x="29" y="38" width="62" height="10" rx="3" />
        </clipPath>
      </defs>

      <ellipse className="m-shadow" cx="60" cy="108" rx="24" ry="4" fill="rgb(0 0 0 / 0.16)" />

      <g className="m-body">
        {/* feet */}
        {/* a thin cream edge keeps the dark parts visible on dark backgrounds */}
        <ellipse cx="49" cy="101" rx="7" ry="4" fill={INK} stroke={CREAM} strokeWidth="1.4" />
        <ellipse cx="71" cy="101" rx="7" ry="4" fill={INK} stroke={CREAM} strokeWidth="1.4" />
        {/* arms */}
        <g className="m-arm-l">
          <path d="M31 74 Q22 74 18 65" fill="none" stroke={CREAM} strokeWidth="6" strokeLinecap="round" />
          <path d="M31 74 Q22 74 18 65" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="18" cy="63.5" r="4.2" fill={CREAM} stroke={INK} strokeWidth="2.5" />
        </g>
        <g className="m-arm-r">
          <path d="M89 74 Q98 74 102 65" fill="none" stroke={CREAM} strokeWidth="6" strokeLinecap="round" />
          <path d="M89 74 Q98 74 102 65" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="102" cy="63.5" r="4.2" fill={CREAM} stroke={INK} strokeWidth="2.5" />
        </g>
        {/* board */}
        <rect x="30" y="50" width="60" height="50" rx="10" fill={CREAM} stroke={CREAM} strokeWidth="6" />
        <g clipPath={`url(#${id}-board)`}>
          <rect x="28" y="50" width="64" height="11" fill={INK} />
          <Stripes y={50} h={11} />
        </g>
        <rect x="30" y="50" width="60" height="50" rx="10" fill="none" stroke={INK} strokeWidth="3" />
        {/* face */}
        <ellipse cx="40" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.6" />
        <ellipse cx="80" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.6" />
        {happy ? (
          <>
            <path d="M43.5 79 Q48 73 52.5 79" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
            <path d="M67.5 79 Q72 73 76.5 79" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
            <path d="M53 84.5 Q60 95 67 84.5 Z" fill={INK} strokeLinejoin="round" />
            <path d="M56.6 89.2 Q60 92.6 63.4 89.2 Q60 87.4 56.6 89.2 Z" fill="#FF6B7A" />
          </>
        ) : (
          <>
            <g className="m-eyes">
              <ellipse cx="48" cy="77" rx="3.4" ry="4.4" fill={INK} />
              <ellipse cx="72" cy="77" rx="3.4" ry="4.4" fill={INK} />
              <circle cx="49.2" cy="75.4" r="1.2" fill="#fff" />
              <circle cx="73.2" cy="75.4" r="1.2" fill="#fff" />
            </g>
            <path d="M55 86 Q60 90.5 65 86" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          </>
        )}
        {/* clapper arm, hinged on the left */}
        <g className="m-clap">
          <rect x="29" y="38" width="62" height="10" rx="3" fill={INK} stroke={CREAM} strokeWidth="5" />
          <g clipPath={`url(#${id}-arm)`}>
            <Stripes y={38} h={10} />
          </g>
          <rect x="29" y="38" width="62" height="10" rx="3" fill="none" stroke={INK} strokeWidth="2.5" />
          <circle cx="33" cy="48" r="2.4" fill={CREAM} stroke={INK} strokeWidth="1.8" />
        </g>
      </g>

      {happy && (
        <>
          <g className="m-confetti">
            {Array.from({ length: 14 }, (_, k) => {
              const a = (-160 + (k * 140) / 13) * (Math.PI / 180);
              const dist = 34 + (k % 3) * 9;
              return (
                <rect
                  key={k}
                  x="58.5"
                  y="47.5"
                  width={k % 2 ? 3 : 4}
                  height={k % 2 ? 5 : 3}
                  rx="1"
                  fill={CONFETTI[k % CONFETTI.length]}
                  // Rounded: the server and the browser can differ in the last digit of sin/cos.
                  style={{ ["--tx" as string]: `${(Math.cos(a) * dist).toFixed(1)}px`, ["--ty" as string]: `${(Math.sin(a) * dist).toFixed(1)}px`, ["--r" as string]: `${(k % 2 ? 1 : -1) * (180 + k * 25)}deg`, ["--d" as string]: `${(k % 4) * 60}ms` }}
                />
              );
            })}
          </g>
          {[
            [16, 30, 0],
            [104, 24, 500],
            [108, 84, 900],
            [12, 90, 1300],
          ].map(([x, y, d]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <path className="m-spark" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#EAB308" style={{ ["--d" as string]: `${1200 + d}ms` }} />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
