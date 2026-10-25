"use client";

import { useEffect } from "react";
import { CloseIcon } from "./icons";
import { Leaves } from "./leaves";

export function ImageLightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Leaves>
      <div
        className="pop-fade fixed inset-0 z-[260] flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-4 sm:p-10"
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
    </Leaves>
  );
}
