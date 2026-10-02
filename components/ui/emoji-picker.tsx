"use client";

import { useEffect, useRef, useState } from "react";

const EMOJI = [
  "😀","😂","😅","😊","😉","😍","🤔","😎","😢","😭","😡","🥳","👍","👎","👏","🙌",
  "🙏","💪","🔥","✨","🎉","✅","❌","⚠️","❤️","💯","👀","🤝","🚀","📌","📝","🎬",
  "🎥","📷","🖥️","💡","⏰","📅","🗓️","💰","🏆","👋","😴","🤯","🫡","🤝‍♂️","😬","🙃",
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors flex-shrink-0"
        aria-label="Add emoji"
        title="Emoji"
      >
        🙂
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+6px)] right-0 z-30 w-64 max-h-52 overflow-y-auto overflow-x-hidden styled-scroll rounded-lg border border-line/10 bg-surface shadow-lg p-2 grid grid-cols-8 gap-0.5">
          {EMOJI.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSelect(e);
                setOpen(false);
              }}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[16px] hover:bg-surface-2"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
