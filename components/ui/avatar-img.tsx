"use client";

import { useState } from "react";

/*
 * A person's picture, a team's logo or an account's picture inside its circle (1.31.9). Loaded straight away, never
 * lazily: on some iPhones a lazy picture inside the page never started loading and the circle stayed a plain colour
 * (the same picture showed in the top bar). If the picture can't be loaded it's tried once more (a fresh copy, past
 * any cache), then the fallback (the initials) shows instead, never an empty circle. A platform's picture (TikTok's,
 * Instagram's links expire after a while) gets the same. No referrer goes with it: the platforms' picture servers
 * can turn away a picture asked for from another site, and our pages' addresses aren't theirs to see.
 *
 *   {url ? <img …/> : initials}   →   <AvatarImg src={url} fallback={initials} />
 */
export function AvatarImg({ src, fallback, alt = "", className = "w-full h-full object-cover" }: { src: string | null | undefined; fallback?: React.ReactNode; alt?: string; className?: string }) {
  if (!src) return <>{fallback ?? null}</>;
  // Another picture (just uploaded): a fresh start.
  return <Picture key={src} src={src} fallback={fallback} alt={alt} className={className} />;
}

function Picture({ src, fallback, alt, className }: { src: string; fallback?: React.ReactNode; alt: string; className: string }) {
  const [tries, setTries] = useState(0);
  if (tries > 1) return <>{fallback ?? null}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tries === 1 ? retryUrl(src) : src}
      alt={alt}
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setTries((t) => t + 1)}
      className={className}
    />
  );
}

/** The same address with a marker that skips the browser's cached failure (data: and blob: addresses stay as they are). */
export function retryUrl(src: string): string {
  if (!/^https?:\/\//i.test(src) && !src.startsWith("/")) return src;
  const [base, hash = ""] = src.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}retry=1${hash ? `#${hash}` : ""}`;
}
