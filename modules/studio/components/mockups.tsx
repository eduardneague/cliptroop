"use client";

import { memo, useEffect, useRef, useState } from "react";

/** One video on the fake page (yours or a placeholder). */
export type MockCard = {
  key: string;
  thumb: string | null;
  title: string;
  channel: string;
  avatar: string | null;
  views: string;
  age: string;
  duration: string;
  mine?: boolean;
};
export type MockTheme = "light" | "dark";
export type MockView = "home" | "search" | "upnext" | "mobile" | "tablet" | "tv";

export const VIEW_SIZE: Record<MockView, number> = { home: 1280, search: 1280, upnext: 1280, mobile: 390, tablet: 834, tv: 1920 };

const PAL = {
  light: { bg: "#ffffff", text: "#0f0f0f", meta: "#606060", chip: "#f2f2f2", chipOn: "#0f0f0f", chipOnText: "#ffffff", line: "#e5e5e5", search: "#ffffff", searchLine: "#d3d3d3", icon: "#0f0f0f", thumbBg: "#e5e5e5" },
  dark: { bg: "#0f0f0f", text: "#f1f1f1", meta: "#aaaaaa", chip: "#272727", chipOn: "#f1f1f1", chipOnText: "#0f0f0f", line: "#303030", search: "#121212", searchLine: "#303030", icon: "#f1f1f1", thumbBg: "#272727" },
};
type Pal = (typeof PAL)["light"];

const CHIPS = ["All", "Technology", "Gaming", "Smartphones", "Podcasts", "Live", "Computers", "Recently uploaded", "New to you"];
const font = "Roboto, Arial, system-ui, sans-serif";

/** Draws a fixed-width page and scales it to the available width. */
export function ScaleFrame({ width, children, maxScale = 1 }: { width: number; children: React.ReactNode; maxScale?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 0, h: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const scale = Math.min(maxScale, o.clientWidth / width);
      setBox({ scale, h: i.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width, maxScale]);
  return (
    <div ref={outer} className="w-full overflow-hidden" style={{ height: box.h || undefined }}>
      <div ref={inner} style={{ width, transform: `scale(${box.scale})`, transformOrigin: "top left", opacity: box.scale ? 1 : 0 }}>
        {children}
      </div>
    </div>
  );
}

function Logo({ p, small = false }: { p: Pal; small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: font }}>
      <svg viewBox="0 0 28 20" width={small ? 26 : 30} height={small ? 18 : 21} aria-hidden>
        <rect width="28" height="20" rx="5" fill="#ff0033" />
        <path d="M11 6l7 4-7 4z" fill="#fff" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: small ? 17 : 19, letterSpacing: -0.6, color: p.text }}>YouTube</span>
    </div>
  );
}

function Header({ p, compact = false }: { p: Pal; compact?: boolean }) {
  return (
    <div style={{ height: compact ? 48 : 56, display: "flex", alignItems: "center", gap: 16, padding: compact ? "0 12px" : "0 16px", background: p.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {!compact && (
          <div style={{ width: 24, display: "grid", gap: 4 }} aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ height: 2, background: p.icon, borderRadius: 1 }} />
            ))}
          </div>
        )}
        <Logo p={p} small={compact} />
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        {!compact && (
          <div style={{ display: "flex", width: 560 }}>
            <div style={{ flex: 1, height: 40, border: `1px solid ${p.searchLine}`, borderRadius: "40px 0 0 40px", background: p.search, padding: "0 16px", display: "flex", alignItems: "center", color: p.meta, fontSize: 16, fontFamily: font }}>Search</div>
            <div style={{ width: 64, height: 40, border: `1px solid ${p.searchLine}`, borderLeft: 0, borderRadius: "0 40px 40px 0", background: p.chip }} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${p.icon}`, opacity: 0.8 }} />
        ))}
        <span style={{ width: 32, height: 32, borderRadius: 16, background: "#e8630d" }} />
      </div>
    </div>
  );
}

function Chips({ p, pad = 24 }: { p: Pal; pad?: number }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: `12px ${pad}px`, overflow: "hidden", background: p.bg }}>
      {CHIPS.map((c, i) => (
        <span key={c} style={{ flexShrink: 0, height: 32, padding: "0 12px", display: "flex", alignItems: "center", borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: font, background: i === 0 ? p.chipOn : p.chip, color: i === 0 ? p.chipOnText : p.text }}>
          {c}
        </span>
      ))}
    </div>
  );
}

function Thumb({ c, p, radius, width }: { c: MockCard; p: Pal; radius: number; width: number | string }) {
  return (
    <div style={{ position: "relative", width, aspectRatio: "16 / 9", borderRadius: radius, overflow: "hidden", background: p.thumbBg, flexShrink: 0 }}>
      {c.thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.thumb} alt="" loading={c.mine ? "eager" : "lazy"} decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      )}
      {c.duration && (
        <span style={{ position: "absolute", right: 6, bottom: 6, background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 12, fontWeight: 500, padding: "1px 4px", borderRadius: 4, fontFamily: font }}>{c.duration}</span>
      )}
    </div>
  );
}

function Avatar({ c, size }: { c: MockCard; size: number }) {
  return c.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.avatar} alt="" loading="lazy" style={{ width: size, height: size, borderRadius: size, objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <span style={{ width: size, height: size, borderRadius: size, background: c.mine ? "#e8630d" : "#9ca3af", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.42, fontFamily: font }}>
      {c.channel.slice(0, 1).toUpperCase()}
    </span>
  );
}

const clamp = (lines: number): React.CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" });

function GridCard({ c, p, titleSize = 16 }: { c: MockCard; p: Pal; titleSize?: number }) {
  return (
    <div data-mine={c.mine ? "true" : undefined} style={{ fontFamily: font }}>
      <Thumb c={c} p={p} radius={12} width="100%" />
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Avatar c={c} size={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: p.text, fontSize: titleSize, fontWeight: 500, lineHeight: 1.4, ...clamp(2) }}>{c.title}</div>
          <div style={{ color: p.meta, fontSize: 14, marginTop: 4 }}>{c.channel}</div>
          <div style={{ color: p.meta, fontSize: 14 }}>
            {c.views} • {c.age}
          </div>
        </div>
      </div>
    </div>
  );
}

export const HomeMock = memo(function HomeMock({ cards, theme }: { cards: MockCard[]; theme: MockTheme }) {
  const p = PAL[theme];
  return (
    <div style={{ background: p.bg, paddingBottom: 24 }}>
      <Header p={p} />
      <Chips p={p} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "40px 16px", padding: "12px 24px" }}>
        {cards.slice(0, 12).map((c) => (
          <GridCard key={c.key} c={c} p={p} />
        ))}
      </div>
    </div>
  );
});

export const TabletMock = memo(function TabletMock({ cards, theme }: { cards: MockCard[]; theme: MockTheme }) {
  const p = PAL[theme];
  return (
    <div style={{ background: p.bg, paddingBottom: 20 }}>
      <Header p={p} compact />
      <Chips p={p} pad={16} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "28px 16px", padding: "8px 16px" }}>
        {cards.slice(0, 6).map((c) => (
          <GridCard key={c.key} c={c} p={p} titleSize={15} />
        ))}
      </div>
    </div>
  );
});

export const SearchMock = memo(function SearchMock({ cards, theme, query }: { cards: MockCard[]; theme: MockTheme; query: string }) {
  const p = PAL[theme];
  return (
    <div style={{ background: p.bg, paddingBottom: 24, fontFamily: font }}>
      <Header p={p} />
      <div style={{ padding: "8px 24px", color: p.meta, fontSize: 14 }}>Results for “{query}”</div>
      <div style={{ display: "grid", gap: 16, padding: "8px 24px", maxWidth: 1096 }}>
        {cards.slice(0, 6).map((c) => (
          <div key={c.key} data-mine={c.mine ? "true" : undefined} style={{ display: "flex", gap: 16 }}>
            <Thumb c={c} p={p} radius={12} width={500} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: p.text, fontSize: 18, fontWeight: 400, lineHeight: 1.4, ...clamp(2) }}>{c.title}</div>
              <div style={{ color: p.meta, fontSize: 12, marginTop: 4 }}>
                {c.views} • {c.age}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", color: p.meta, fontSize: 12 }}>
                <Avatar c={c} size={24} />
                {c.channel}
              </div>
              <div style={{ color: p.meta, fontSize: 12, lineHeight: 1.5, ...clamp(2) }}>
                {c.mine ? "Your video, among real results for this search." : "A popular video you're competing with for attention."}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export const UpNextMock = memo(function UpNextMock({ cards, theme, playing }: { cards: MockCard[]; theme: MockTheme; playing: MockCard | null }) {
  const p = PAL[theme];
  return (
    <div style={{ background: p.bg, paddingBottom: 24, fontFamily: font }}>
      <Header p={p} />
      <div style={{ display: "flex", gap: 24, padding: "24px 24px 0" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", background: "#000", position: "relative" }}>
            {playing?.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={playing.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
            )}
          </div>
          <div style={{ color: p.text, fontSize: 20, fontWeight: 700, marginTop: 12, ...clamp(2) }}>{playing?.title ?? ""}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            {playing && <Avatar c={playing} size={40} />}
            <div style={{ color: p.text, fontSize: 16, fontWeight: 500 }}>{playing?.channel}</div>
          </div>
        </div>
        <div style={{ width: 402, display: "grid", gap: 8, alignContent: "start" }}>
          {cards.slice(0, 9).map((c) => (
            <div key={c.key} data-mine={c.mine ? "true" : undefined} style={{ display: "flex", gap: 8 }}>
              <Thumb c={c} p={p} radius={8} width={168} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: p.text, fontSize: 14, fontWeight: 500, lineHeight: 1.4, ...clamp(2) }}>{c.title}</div>
                <div style={{ color: p.meta, fontSize: 12, marginTop: 4 }}>{c.channel}</div>
                <div style={{ color: p.meta, fontSize: 12 }}>
                  {c.views} • {c.age}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export const MobileMock = memo(function MobileMock({ cards, theme }: { cards: MockCard[]; theme: MockTheme }) {
  const p = PAL[theme];
  return (
    <div style={{ background: p.bg, fontFamily: font, borderRadius: 36, overflow: "hidden", border: `10px solid ${theme === "dark" ? "#2a2a2a" : "#1f1f1f"}` }}>
      <div style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", color: p.text, fontSize: 13, fontWeight: 600 }}>
        <span>9:41</span>
        <span style={{ width: 90, height: 24, borderRadius: 14, background: "#000" }} />
        <span>100%</span>
      </div>
      <Header p={p} compact />
      <Chips p={p} pad={12} />
      <div style={{ display: "grid", gap: 20, paddingBottom: 16 }}>
        {cards.slice(0, 4).map((c) => (
          <div key={c.key} data-mine={c.mine ? "true" : undefined}>
            <Thumb c={c} p={p} radius={0} width="100%" />
            <div style={{ display: "flex", gap: 12, padding: "10px 12px 0" }}>
              <Avatar c={c} size={36} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: p.text, fontSize: 15, fontWeight: 500, lineHeight: 1.35, ...clamp(2) }}>{c.title}</div>
                <div style={{ color: p.meta, fontSize: 12, marginTop: 3 }}>
                  {c.channel} • {c.views} • {c.age}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export const TvMock = memo(function TvMock({ cards }: { cards: MockCard[] }) {
  // The TV app is always dark.
  const p = PAL.dark;
  return (
    <div style={{ background: "#0f0f0f", fontFamily: font, display: "flex", minHeight: 1080 }}>
      <div style={{ width: 96, display: "grid", alignContent: "start", justifyItems: "center", gap: 36, paddingTop: 48 }}>
        <Logo p={p} small />
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ width: 36, height: 36, borderRadius: 10, border: "3px solid #aaa", opacity: 0.6 }} />
        ))}
      </div>
      <div style={{ flex: 1, padding: "48px 48px 0 24px" }}>
        {["Recommended", "Subscriptions"].map((row, r) => (
          <div key={row} style={{ marginBottom: 48 }}>
            <div style={{ color: "#f1f1f1", fontSize: 32, fontWeight: 500, marginBottom: 20 }}>{row}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }}>
              {cards.slice(r * 4, r * 4 + 4).map((c) => (
                <div key={c.key} data-mine={c.mine ? "true" : undefined}>
                  <div style={{ borderRadius: 16, outline: c.mine ? "6px solid #fff" : "none", outlineOffset: 4 }}>
                    <Thumb c={c} p={p} radius={16} width="100%" />
                  </div>
                  <div style={{ color: "#f1f1f1", fontSize: 24, fontWeight: 500, lineHeight: 1.3, marginTop: 16, ...clamp(2) }}>{c.title}</div>
                  <div style={{ color: "#aaa", fontSize: 20, marginTop: 6 }}>
                    {c.channel} • {c.views}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
