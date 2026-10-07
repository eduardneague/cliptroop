import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import { Mascot } from "@/components/ui/mascot";

const LINES = ["Rolling the cameras…", `${MASCOT_NAME} is fetching your videos…`, "Lining up today’s tasks…", "Polishing the thumbnails…"];

/**
 * What you see while the app opens (first load, the installed app starting,
 * signing in): Clip clapping in the middle of the screen. Plain HTML + CSS,
 * so it shows the moment the first bytes arrive, before any JavaScript.
 * It waits a beat before fading in, so quick loads never flash it.
 * Styles: globals.css, "App splash".
 */
export function AppSplash() {
  return (
    <div className="app-splash" role="status" aria-label={`Opening ${APP_NAME}`}>
      <div className="app-splash-inner">
        <div className="app-splash-clip">
          <Mascot size={124} />
        </div>
        <div className="font-display text-[26px] font-semibold tracking-tight mt-1">{APP_NAME}</div>
        <div className="app-splash-lines text-[13.5px] text-ink-soft" aria-hidden>
          {LINES.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <div className="app-splash-bar" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  );
}
