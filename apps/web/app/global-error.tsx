"use client";

import { useEffect, useState } from "react";

import { buildErrorReport, formatErrorReport } from "@/lib/errorContext";

// Global error UI replaces the root layout entirely when active, so it
// can't rely on globals.css, fonts, or any component in the tree above
// it (no GameRepositoryProvider, no Tailwind classes) — see the Next.js
// docs for `global-error.tsx`. Colors are hand-copied from globals.css
// rather than imported, since nothing here can assume that file loaded.
const styles = {
  body: {
    margin: 0,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    background: "#0a0a0c",
    color: "#f4f4f5",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  main: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
    width: "100%",
    maxWidth: "28rem",
    border: "2px solid #f87171",
    background: "rgba(248, 113, 113, 0.1)",
    borderRadius: "0.5rem",
    padding: "1rem",
  },
  heading: { margin: 0, fontSize: "1.125rem", fontWeight: 600 },
  message: { margin: 0, color: "#f87171", fontSize: "0.875rem" },
  button: {
    minHeight: "2.75rem",
    minWidth: "2.75rem",
    borderRadius: "0.375rem",
    border: "1px solid #68686e",
    background: "transparent",
    color: "#f4f4f5",
    font: "inherit",
    cursor: "pointer",
  },
  details: { fontSize: "0.75rem" },
  pre: {
    marginTop: "0.5rem",
    maxHeight: "10rem",
    overflow: "auto",
    border: "1px solid #68686e",
    borderRadius: "0.375rem",
    padding: "0.5rem",
    fontSize: "11px",
    whiteSpace: "pre-wrap" as const,
  },
};

/**
 * Root-level fallback for a crash outside any game route (the home page's
 * own list, settings, stats, ...) — the per-game `error.tsx` next to this
 * one is where the real recovery options (revert/export) live, since those
 * are inherently per-game; there's no specific game to act on this high up
 * the tree. See AGENTS.md issue #86.
 */
export default function GlobalError({
  error,
}: {
  readonly error: Error & { digest?: string };
}) {
  const [copied, setCopied] = useState(false);
  const report = formatErrorReport(buildErrorReport(error));

  useEffect(() => {
    console.error(error);
  }, [error]);

  async function handleCopyDetails() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the text is still visible below.
    }
  }

  return (
    <html lang="en">
      <body style={styles.body}>
        <main role="alert" style={styles.main}>
          <div>
            <h1 style={styles.heading}>Something went wrong</h1>
            <p style={styles.message}>{error.message}</p>
          </div>
          <button type="button" style={styles.button} onClick={() => window.location.reload()}>
            Reload
          </button>
          <details style={styles.details}>
            <summary style={{ minHeight: "2.75rem", display: "flex", alignItems: "center", cursor: "pointer" }}>
              Technical details
            </summary>
            <pre style={styles.pre}>{report}</pre>
            <button
              type="button"
              style={{ ...styles.button, marginTop: "0.5rem", width: "100%" }}
              onClick={() => void handleCopyDetails()}
            >
              {copied ? "Copied!" : "Copy details"}
            </button>
          </details>
        </main>
      </body>
    </html>
  );
}
