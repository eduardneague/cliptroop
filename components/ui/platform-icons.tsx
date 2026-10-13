import { useId } from "react";

export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="6" fill="#FF0000" />
      <path d="M10 8.3v7.4l6.4-3.7L10 8.3Z" fill="#fff" />
    </svg>
  );
}

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="6" fill="#000" />
      <path
        d="M15.8 6.2c.5.9 1.4 1.5 2.5 1.6v2.1a4.4 4.4 0 0 1-2.5-.8v4.6a3.9 3.9 0 1 1-3.9-3.9c.2 0 .3 0 .5.02v2.1a1.8 1.8 0 1 0 1.3 1.7V4h2.1v2.2Z"
        fill="#fff"
      />
    </svg>
  );
}

/*
 * Its gradient gets its own id per icon (1.18.0): with one shared id, every
 * Instagram logo used the first one's, and when that one sat in a hidden
 * part of the page (a phone-only list on a computer) browsers drew the rest
 * without colour.
 */
export function InstagramIcon({ className }: { className?: string }) {
  const id = `ig-grad${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="24" x2="24" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.35" stopColor="#D62976" />
          <stop offset="0.7" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${id})`} />
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
