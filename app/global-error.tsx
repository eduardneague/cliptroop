"use client";

import { useEffect } from "react";
import { reportBrowserError } from "@/components/error-reporter";

/**
 * The last resort: the root layout itself failed, so this draws its own page
 * (no app styles are guaranteed here, hence the inline ones).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportBrowserError({ message: error.message, stack: error.stack });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", background: "#edeee7", color: "#14110c" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>VPlanner hit a problem</h1>
          <p style={{ fontSize: 14, color: "#57534e", margin: "0 0 20px" }}>It&rsquo;s been reported. Try again in a moment.</p>
          <button onClick={reset} style={{ background: "#e8630d", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Try again
          </button>
          {error.digest && <p style={{ fontSize: 11, color: "#a8a29e", marginTop: 16, fontFamily: "monospace" }}>Error {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
