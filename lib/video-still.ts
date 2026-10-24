/**
 * A video's address that shows its first moment as a still before it plays (1.31.9). An iPhone draws nothing for a
 * <video> that hasn't played (other browsers show the first frame): with "#t=0.1" Safari loads that moment and
 * shows it, so wallpaper previews and the dashboard's video wallpaper with animations off aren't empty boxes.
 * Playback (and a loop) still starts from there or the beginning as usual. Addresses that already name a moment
 * (or another fragment) are left alone.
 */
export function stillSrc(src: string): string;
export function stillSrc(src: string | null | undefined): string | undefined;
export function stillSrc(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  return src.includes("#") ? src : `${src}#t=0.1`;
}
