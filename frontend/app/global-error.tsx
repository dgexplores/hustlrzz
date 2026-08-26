"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0b1020", color: "#f4f6fb", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ maxWidth: 480, textAlign: "center", padding: 32 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Hustlrzz hit a critical error</h1>
          <p style={{ opacity: 0.7, fontSize: 14, lineHeight: 1.6 }}>
            The application shell failed to load{error.digest ? ` (reference ${error.digest})` : ""}. Reload to try again.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: "10px 20px", borderRadius: 999, border: "none", background: "#3b82f6", color: "white", fontSize: 14, cursor: "pointer" }}
          >
            Reload application
          </button>
        </div>
      </body>
    </html>
  );
}
