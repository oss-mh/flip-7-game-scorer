import type { ReactElement } from "react";

// Mirrors the CSS custom properties in app/globals.css. ImageResponse
// (satori) can't read CSS variables, so the palette is duplicated here.
const BACKGROUND = "#0a0a0c";
const SURFACE = "#18181b";
const BORDER = "#2b2b31";
const MARK = "#fbbf24";

/**
 * Renders the app's "flipped 7" mark at an arbitrary pixel size, for use
 * inside `next/og`'s `ImageResponse`. Maskable icons need their content
 * kept inside the safe-zone circle (~80% of the canvas), so they get more
 * inset than a regular icon.
 */
export function appIconMark(size: number, options: { maskable?: boolean } = {}): ReactElement {
  const { maskable = false } = options;
  const inset = size * (maskable ? 0.2 : 0.07);
  const inner = size - inset * 2;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BACKGROUND,
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: inner * 0.24,
          background: SURFACE,
          border: `${Math.max(2, size * 0.012)}px solid ${BORDER}`,
        }}
      >
        <span style={{ fontSize: inner * 0.58, fontWeight: 700, color: MARK }}>7</span>
      </div>
    </div>
  );
}

/**
 * Renders a full-bleed splash background sized to a device screen, with the
 * app mark centered — used for iOS `apple-touch-startup-image` links, which
 * must be exact device-pixel dimensions rather than a scaled icon.
 */
export function splashScreen(width: number, height: number): ReactElement {
  const mark = Math.min(width, height) * 0.3;

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BACKGROUND,
      }}
    >
      {appIconMark(mark)}
    </div>
  );
}
