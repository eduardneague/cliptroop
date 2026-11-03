export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="6" fill="#FF0000" />
      <path d="M10 8.3v7.4l6.4-3.7L10 8.3Z" fill="#fff" />
    </svg>
  );
}

// TikTok's note, and its cyan and red echoes.
const TT_NOTE = "M15.8 6.2c.5.9 1.4 1.5 2.5 1.6v2.1a4.4 4.4 0 0 1-2.5-.8v4.6a3.9 3.9 0 1 1-3.9-3.9c.2 0 .3 0 .5.02v2.1a1.8 1.8 0 1 0 1.3 1.7V4h2.1v2.2Z";
/**
 * 1.35.0: the black tile has a faint light rim and the note its cyan and red
 * echoes, as TikTok draws it: on a dark card or a black chip the plain black
 * tile disappeared. On a light background the rim doesn't show.
 */
export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="6" fill="#000" />
      <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="none" stroke="#fff" strokeOpacity="0.24" />
      <path d={TT_NOTE} fill="#25F4EE" transform="translate(-0.65 -0.55)" />
      <path d={TT_NOTE} fill="#FE2C55" transform="translate(0.65 0.55)" />
      <path d={TT_NOTE} fill="#fff" />
    </svg>
  );
}

/*
 * Its gradient (1.20.0): a CSS background on the icon itself, no SVG
 * gradient. With one shared id, every Instagram logo used the first one's
 * (a hidden one drew the rest without colour, 1.18.0); with an id per icon
 * (useId), pages loaded in parts got other ids in the browser than on the
 * server (a hydration mismatch). A background needs no id at all.
 */
const IG_BACKGROUND = "linear-gradient(45deg, #FEDA75 0%, #D62976 35%, #962FBF 70%, #4F5BD5 100%)";
export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={{ background: IG_BACKGROUND, borderRadius: "25%" }}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.2" fill="none" stroke="#fff" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.4" />
      <circle cx="16.1" cy="7.9" r="0.9" fill="#fff" />
    </svg>
  );
}

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="6" fill="#0866FF" />
      <path
        d="M14.2 8.6h1.6V6.2h-1.9c-2 0-3 1.2-3 3.1v1.4H9.3v2.4h1.6V19h2.5v-5.9h1.9l.4-2.4h-2.3V9.6c0-.6.3-1 .8-1Z"
        fill="#fff"
      />
    </svg>
  );
}

/**
 * 1.41.0, "any platform" (the media kit's rates: the owner, "something that shows any platform, maybe all of them in a
 * grid"): every platform's logo, two by two, in the room of one.
 */
export function AnyPlatformIcon({ className }: { className?: string }) {
  return (
    <span className={`inline-grid grid-cols-2 grid-rows-2 gap-[8%] flex-shrink-0 ${className ?? ""}`} role="img" aria-label="Any platform">
      <YouTubeIcon className="w-full h-full" />
      <InstagramIcon className="w-full h-full" />
      <TikTokIcon className="w-full h-full" />
      <FacebookIcon className="w-full h-full" />
    </span>
  );
}
