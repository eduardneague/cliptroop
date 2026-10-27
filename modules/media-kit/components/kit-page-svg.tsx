"use client";

import { useId, type ReactNode } from "react";
import { roundRect, type Color, type FontKey, type Op, type Page } from "../lib/scene";

/*
 * One page of a media kit, drawn as SVG for the preview (1.37.0): the same steps the PDF draws, with the PDF's own
 * fonts (KIT_FONT_CSS), so the preview is the kit.
 */

const FAMILY: Record<FontKey, { family: string; weight: number }> = {
  reg: { family: "'Kit Inter', Inter, sans-serif", weight: 400 },
  semi: { family: "'Kit Inter', Inter, sans-serif", weight: 600 },
  disp: { family: "'Kit Fraunces', Fraunces, serif", weight: 600 },
};

/** The PDF's fonts for the preview (the same files the PDF embeds). */
export const KIT_FONT_CSS = `
@font-face { font-family: "Kit Inter"; src: url("/fonts/pdf/Inter-Regular.ttf") format("truetype"); font-weight: 400; font-display: block; }
@font-face { font-family: "Kit Inter"; src: url("/fonts/pdf/Inter-SemiBold.ttf") format("truetype"); font-weight: 600; font-display: block; }
@font-face { font-family: "Kit Fraunces"; src: url("/fonts/pdf/Fraunces-SemiBold.ttf") format("truetype"); font-weight: 600; font-display: block; }
`;

const rgb = (c: Color) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** `links` (1.39.0): off where the page is itself a button (the builder's preview, the pages along the presenter's bottom). */
export function KitPageSvg({ page, className, title, links = true }: { page: Page; className?: string; title?: string; links?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const defs: ReactNode[] = [];
  // Ops in order; a clip opens a group that the matching unclip closes.
  const stack: ReactNode[][] = [[]];
  const push = (n: ReactNode) => stack[stack.length - 1].push(n);
  const clipIds: string[] = [];

  page.ops.forEach((op: Op, i) => {
    const key = `o${i}`;
    switch (op.t) {
      case "rect":
        push(
          <path
            key={key}
            d={roundRect(op.x, op.y, op.w, op.h, op.r ?? 0)}
            fill={op.fill ? rgb(op.fill) : "none"}
            fillOpacity={op.fill ? (op.o ?? 1) : undefined}
            stroke={op.stroke ? rgb(op.stroke) : undefined}
            strokeWidth={op.stroke ? (op.sw ?? 1) : undefined}
            strokeOpacity={op.stroke ? (op.o ?? 1) : undefined}
          />
        );
        break;
      case "text":
        push(
          <text
            key={key}
            x={op.x}
            y={op.y}
            fontFamily={FAMILY[op.f].family}
            fontWeight={FAMILY[op.f].weight}
            fontSize={op.size}
            fill={rgb(op.c)}
            fillOpacity={op.o}
            style={{ fontKerning: "none", whiteSpace: "pre" }}
          >
            {op.s}
          </text>
        );
        break;
      case "image": {
        const id = `${uid}-i${i}`;
        defs.push(
          <clipPath key={id} id={id}>
            <path d={roundRect(op.x, op.y, op.w, op.h, op.r ?? 0)} />
          </clipPath>
        );
        push(
          <g key={key} clipPath={`url(#${id})`}>
            <rect x={op.x} y={op.y} width={op.w} height={op.h} fill="rgb(128 128 128)" fillOpacity={0.12} />
            <image href={op.src} x={op.x} y={op.y} width={op.w} height={op.h} preserveAspectRatio="xMidYMid slice" />
          </g>
        );
        break;
      }
      case "path":
        push(
          <path
            key={key}
            d={op.d}
            fill={op.fill ? rgb(op.fill) : "none"}
            fillOpacity={op.fill ? (op.o ?? 1) : undefined}
            stroke={op.stroke ? rgb(op.stroke) : undefined}
            strokeWidth={op.stroke ? (op.sw ?? 1) : undefined}
            strokeOpacity={op.stroke ? (op.so ?? (op.fill ? 1 : (op.o ?? 1))) : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
        break;
      case "circle":
        push(
          <circle
            key={key}
            cx={op.cx}
            cy={op.cy}
            r={op.r}
            fill={op.fill ? rgb(op.fill) : "none"}
            fillOpacity={op.fill ? (op.o ?? 1) : undefined}
            stroke={op.stroke ? rgb(op.stroke) : undefined}
            strokeWidth={op.stroke ? (op.sw ?? 1) : undefined}
          />
        );
        break;
      case "clip": {
        const id = `${uid}-c${i}`;
        defs.push(
          <clipPath key={id} id={id}>
            <path d={roundRect(op.x, op.y, op.w, op.h, op.r ?? 0)} />
          </clipPath>
        );
        clipIds.push(id);
        stack.push([]);
        break;
      }
      case "unclip": {
        const id = clipIds.pop();
        const kids = stack.length > 1 ? stack.pop()! : [];
        if (id)
          push(
            <g key={key} clipPath={`url(#${id})`}>
              {kids}
            </g>
          );
        break;
      }
      case "link":
        if (!links) break;
        push(
          <a key={key} href={op.url} target="_blank" rel="noopener noreferrer">
            <rect x={op.x} y={op.y} width={op.w} height={op.h} fill="transparent" />
          </a>
        );
        break;
    }
  });
  // A clip never closed: its group still drawn.
  while (stack.length > 1) {
    const kids = stack.pop()!;
    const id = clipIds.pop();
    push(
      <g key={`end${stack.length}`} clipPath={id ? `url(#${id})` : undefined}>
        {kids}
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${page.w} ${page.h}`} className={className} role="img" aria-label={title ?? page.label} xmlns="http://www.w3.org/2000/svg">
      <defs>{defs}</defs>
      <rect width={page.w} height={page.h} fill={rgb(page.bg)} />
      {stack[0]}
    </svg>
  );
}
