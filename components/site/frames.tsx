import { CheckIcon } from "@/components/ui/icons";

/*
 * Still frames for the Features page's chapters that have no demo on the
 * home page (1.33.0): Thumbnail Studio and Outliers. Sample data, nobody
 * real; the same card as the home page's demos (components/landing/vignettes).
 */

const card = "rounded-[22px] border border-line/10 bg-surface shadow-[0_24px_60px_-28px_rgb(var(--line)/0.35)]";

/** A thumbnail stand-in: two colours and a shape, like a frame from a video. */
function Thumb({ a, b, tall = false, children }: { a: string; b: string; tall?: boolean; children?: React.ReactNode }) {
  return (
    <span
      className={`relative block ${tall ? "aspect-[9/16]" : "aspect-video"} rounded-lg overflow-hidden`}
      style={{ background: `radial-gradient(70% 90% at 72% 40%, ${b} 0 38%, transparent 39%), linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Thumbnail Studio: three versions on YouTube's home page, one picked. */
export function StudioFrame() {
  const versions = [
    { a: "#E8630D", b: "#FFB36B", title: "I tried every bakery in town", views: "Your channel", pick: false },
    { a: "#2F56C2", b: "#9DB8FF", title: "I tried every bakery in town", views: "Your channel", pick: true },
    { a: "#158273", b: "#8FE3D3", title: "I tried every bakery in town", views: "Your channel", pick: false },
  ];
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3 mb-4 text-[12.5px]">
        <span className="font-semibold">YouTube home, on a computer</span>
        <span className="text-ink-soft">Version B picked</span>
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {versions.map((v, i) => (
          <li key={i}>
            <Thumb a={v.a} b={v.b}>
              <span className="absolute right-1.5 bottom-1.5 rounded-[4px] bg-black/75 text-white text-[10px] font-semibold px-1 leading-4">12:04</span>
              {v.pick && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-amber text-white text-[10.5px] font-bold px-1.5 h-5">
                  <CheckIcon className="w-3 h-3" />B
                </span>
              )}
            </Thumb>
            <div className="mt-2 text-[12px] font-semibold leading-snug line-clamp-2">{v.title}</div>
            <div className="mt-0.5 text-[11px] text-ink-faint">{v.views}</div>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        {[
          { a: "#6B4E3D", b: "#C9A88E", t: "Another channel's video" },
          { a: "#3E3E52", b: "#A3A3C2", t: "Another channel's video" },
        ].map((o, i) => (
          <div key={i} className="flex gap-2.5 items-start opacity-70">
            <span className="w-[42%] flex-shrink-0">
              <Thumb a={o.a} b={o.b} />
            </span>
            <span className="text-[11.5px] text-ink-soft leading-snug">{o.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Outliers: videos far above their channel's usual. */
export function OutliersFrame() {
  const rows = [
    { a: "#C2410C", b: "#FDBA74", title: "We cooked for 100 strangers", channel: "Kitchen Club", times: 14.2 },
    { a: "#1D4ED8", b: "#93C5FD", title: "The cheapest flight in Europe", channel: "Gap Year Gang", times: 9.8 },
    { a: "#047857", b: "#6EE7B7", title: "I lived in a van for a month", channel: "Slow Roads", times: 6.1 },
  ];
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3 mb-4 text-[12.5px]">
        <span className="font-semibold">Your niche, this month</span>
        <span className="text-ink-soft">Times their usual</span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.title} className="flex items-center gap-3">
            <span className="w-28 sm:w-32 flex-shrink-0">
              <Thumb a={r.a} b={r.b} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold leading-snug truncate">{r.title}</span>
              <span className="block text-[12px] text-ink-soft truncate">{r.channel}</span>
            </span>
            <span className="font-display text-[22px] font-semibold tabular-nums text-green">{r.times.toFixed(1)}×</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
