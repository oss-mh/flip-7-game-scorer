"use client";

import { useState } from "react";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shares the round history as text (#41's "sharable as an image or text
 * summary" — text, since there's no image-generation dependency in this
 * repo to reuse and AGENTS.md says not to add one without asking). Prefers
 * the native share sheet where available, falls back to the clipboard, and
 * degrades to a visible, selectable block of text as a last resort so the
 * feature still works on a browser with neither API.
 */
export function ShareSummaryButton({ text }: { readonly text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "unsupported" | "error">("idle");

  async function handleShare() {
    setStatus("idle");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text, title: "Flip 7 round history" });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setStatus("copied");
        return;
      }
      setStatus("unsupported");
    } catch (error) {
      // The user cancelling the native share sheet isn't a failure.
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus("error");
      console.error("Failed to share round history:", errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => void handleShare()}>
        Share history
      </button>
      {status === "copied" && (
        <p role="status" className="text-status-active text-xs">
          Copied to clipboard.
        </p>
      )}
      {(status === "unsupported" || status === "error") && (
        <details className="w-full max-w-sm">
          <summary className="text-muted-foreground flex min-h-touch min-w-touch cursor-pointer items-center justify-center text-center text-xs underline">
            {status === "unsupported" ? "Copy manually" : "Couldn't share — copy manually"}
          </summary>
          <textarea
            readOnly
            value={text}
            className="border-border bg-background mt-2 h-40 w-full rounded-md border p-2 text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        </details>
      )}
    </div>
  );
}
