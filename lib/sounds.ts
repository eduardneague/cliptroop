/**
 * Small UI sounds, made on the fly with Web Audio (no files to load).
 * Quiet by design. On or off per account (Settings → Preferences → Sounds),
 * remembered on the device so it applies before the page has loaded.
 *
 * Use from code: sounds.success(). From markup: data-sound="send" on any
 * button or link (played by SoundSync's click listener).
 */

export const SOUNDS_KEY = "vp-sounds";
let ctx: AudioContext | null = null;
let enabled = true;
let last = 0;

try {
  if (typeof window !== "undefined" && localStorage.getItem(SOUNDS_KEY) === "off") enabled = false;
} catch {}

export function setSoundsEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(SOUNDS_KEY, on ? "on" : "off");
  } catch {}
}
export const soundsEnabled = () => enabled;

function audio(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One note with a soft attack and a natural decay. */
function note(ac: AudioContext, freq: number, at: number, dur: number, vol: number, type: OscillatorType = "sine", glideTo?: number) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.6);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Plays at most one sound per 40ms, so a burst of events doesn't stack up. */
function play(fn: (ac: AudioContext) => void) {
  const ac = audio();
  if (!ac) return;
  const now = performance.now();
  if (now - last < 40) return;
  last = now;
  fn(ac);
}

export const sounds = {
  /** Checking a to-do off: a bright little two-note chime. */
  check: () =>
    play((ac) => {
      note(ac, 520, 0, 0.07, 0.05, "triangle", 760);
      note(ac, 1046.5, 0.045, 0.18, 0.06);
      note(ac, 1568, 0.11, 0.32, 0.05);
    }),
  /** Un-checking: one soft, lower note. */
  uncheck: () => play((ac) => note(ac, 740, 0, 0.14, 0.04, "sine", 520)),
  /** Picking something up to drag it. */
  lift: () => play((ac) => note(ac, 380, 0, 0.08, 0.03, "triangle", 560)),
  /** Setting it down: a soft thud plus a tiny click. */
  drop: () =>
    play((ac) => {
      note(ac, 260, 0, 0.12, 0.06, "sine", 140);
      note(ac, 1900, 0, 0.03, 0.015, "triangle");
    }),
  /** Something added. */
  pop: () => play((ac) => note(ac, 660, 0, 0.09, 0.04, "sine", 990)),
  /** Saved / done (success toasts). */
  success: () =>
    play((ac) => {
      note(ac, 880, 0, 0.12, 0.035);
      note(ac, 1318.5, 0.07, 0.2, 0.035);
    }),
  /** Something went wrong (error toasts): two low, soft notes. */
  error: () =>
    play((ac) => {
      note(ac, 330, 0, 0.12, 0.05, "triangle");
      note(ac, 262, 0.11, 0.18, 0.05, "triangle");
    }),
  /** A new notification arrived. */
  notify: () =>
    play((ac) => {
      note(ac, 987.8, 0, 0.16, 0.04);
      note(ac, 1480, 0.09, 0.3, 0.035);
    }),
  /** Sent (a comment, a message, an invite). */
  send: () => play((ac) => note(ac, 500, 0, 0.12, 0.035, "sine", 1100)),
  /** A switch or checkbox flipped. */
  tick: () => play((ac) => note(ac, 1400, 0, 0.035, 0.02, "triangle")),
  /** A popup that asks you to confirm. */
  ask: () => play((ac) => note(ac, 620, 0, 0.1, 0.025, "sine", 700)),
  /** Moving to the next step (a video advancing a stage). */
  advance: () =>
    play((ac) => {
      note(ac, 523.3, 0, 0.1, 0.035);
      note(ac, 659.3, 0.06, 0.1, 0.035);
      note(ac, 784, 0.12, 0.22, 0.04);
    }),
  /** Everything done: a little fanfare. */
  celebrate: () =>
    play((ac) => {
      [523.3, 659.3, 784, 1046.5].forEach((f, k) => note(ac, f, k * 0.075, 0.22, 0.04));
      note(ac, 1568, 0.33, 0.45, 0.03);
    }),
  /** An objective reached: a proper fanfare (da da da DAAA), a ringing chord and a sparkle on top. */
  fanfare: () =>
    play((ac) => {
      [392, 523.3, 659.3].forEach((f, k) => note(ac, f, k * 0.12, 0.17, 0.045, "triangle"));
      note(ac, 784, 0.36, 0.62, 0.055, "triangle");
      [523.3, 659.3, 784, 1046.5].forEach((f) => note(ac, f, 0.4, 1.1, 0.02));
      [1568, 2093, 2637, 3136].forEach((f, k) => note(ac, f, 0.62 + k * 0.07, 0.3, 0.012));
    }),
};

export type SoundName = keyof typeof sounds;
