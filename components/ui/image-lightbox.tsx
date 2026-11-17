"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { CloseIcon } from "./icons";
import { Leaves } from "./leaves";

/**
 * A picture, full screen. 1.53.3: a portal (from a script it sat under the script's header and the top bar, which didn't
 * go dark); the page holds still behind it, and Esc closes only it.
 */
export function ImageLightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  const close = useLatest(onClose);
  useScrollLock();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  return createPortal(
    <Leaves lock>
      <div
        className="pop-fade fixed inset-0 z-[260] flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-4 sm:p-10"
        role="dialog"
        aria-modal="true"
        aria-label={alt || "Picture"}
        onClick={onClose}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-xl bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Close"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy" decoding="async"
          src={url}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          className="pop-modal max-w-full max-h-full rounded-lg object-contain"
        />
      </div>
    </Leaves>,
    document.body
  );
}
