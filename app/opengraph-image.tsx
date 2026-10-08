import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

/*
 * The picture link previews show (Facebook, WhatsApp, Slack, iMessage…),
 * for every page: the slate, Clip and the tagline. Public in middleware.
 */
export const alt = `${APP_NAME}: ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#2B2118";
const CREAM = "#FFF4E6";
const AMBER = "#E8630D";

function clip() {
  const stripes = (y: number, h: number) =>
    Array.from({ length: 7 }, (_, k) => {
      const x = 22 + k * 11;
      return `<polygon points="${x},${y + h} ${x + 6},${y} ${x + 12},${y} ${x + 6},${y + h}" fill="${AMBER}"/>`;
    }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 20 84 90"><defs><clipPath id="b"><rect x="30" y="50" width="60" height="50" rx="10"/></clipPath><clipPath id="a"><rect x="29" y="38" width="62" height="10" rx="3"/></clipPath></defs><rect x="30" y="50" width="60" height="50" rx="10" fill="${CREAM}" stroke="${CREAM}" stroke-width="6"/><g clip-path="url(#b)"><rect x="28" y="50" width="64" height="11" fill="${INK}"/>${stripes(50, 11)}</g><rect x="30" y="50" width="60" height="50" rx="10" fill="none" stroke="${INK}" stroke-width="3.4"/><ellipse cx="40" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.65"/><ellipse cx="80" cy="86" rx="4.5" ry="2.5" fill="#FF8FA3" opacity="0.65"/><path d="M43.5 79 Q48 73 52.5 79" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M67.5 79 Q72 73 76.5 79" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M53 84.5 Q60 95 67 84.5 Z" fill="${INK}"/><g transform="rotate(-14 31 48)"><rect x="29" y="38" width="62" height="10" rx="3" fill="${INK}" stroke="${CREAM}" stroke-width="5"/><g clip-path="url(#a)">${stripes(38, 10)}</g><rect x="29" y="38" width="62" height="10" rx="3" fill="none" stroke="${INK}" stroke-width="2.8"/></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export default function OpengraphImage() {
  const band = { display: "flex", height: 34, width: "100%", backgroundImage: `repeating-linear-gradient(-58deg, ${AMBER} 0px, ${AMBER} 22px, ${INK} 22px, ${INK} 44px)` } as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, color: CREAM }}>
        <div style={band} />
        <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "0 80px", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 30, letterSpacing: 6, color: "rgba(255,244,230,0.55)", fontWeight: 700 }}>PROD.</div>
            <div style={{ fontSize: 104, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>{APP_NAME}</div>
            <div style={{ fontSize: 40, marginTop: 28, lineHeight: 1.2, color: "rgba(255,244,230,0.85)", maxWidth: 640 }}>{APP_TAGLINE}</div>
            <div style={{ fontSize: 30, marginTop: 36, color: AMBER, fontFamily: "monospace" }}>00:00:12:08</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={clip()} width={300} height={321} alt="" />
        </div>
        <div style={{ ...band, height: 18 }} />
      </div>
    ),
    size
  );
}
