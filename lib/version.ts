/**
 * The app's version, e.g. "P1.0.0 · a1b2c3d".
 * P = production, E = experimental (staging), D = your computer.
 * Bump package.json: fixes 1.0.x, features 1.x.0, milestones x.0.0.
 */
export const APP_CHANNEL = (process.env.NEXT_PUBLIC_APP_CHANNEL ?? "D") as "P" | "E" | "D";
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";
export const APP_VERSION_LABEL = `${APP_CHANNEL}${APP_VERSION}${APP_COMMIT ? ` · ${APP_COMMIT}` : ""}`;
