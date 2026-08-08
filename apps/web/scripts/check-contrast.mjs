// WCAG AA contrast, checked directly against the fixed dark-mode palette in
// app/globals.css. No headless browser or DOM needed — every color in this
// app is a static CSS custom property, never computed or themed at
// runtime, so the palette below is the complete set of colors that can
// ever actually render. Keep it in sync with globals.css by hand; there
// are few enough entries that drift is easy to catch in review.
const PALETTE = {
  background: "#0a0a0c",
  foreground: "#f4f4f5",
  surface: "#18181b",
  border: "#68686e",
  mutedForeground: "#a1a1aa",
  cardNumber: "#38bdf8",
  cardModifier: "#c084fc",
  cardAction: "#fb923c",
  statusActive: "#34d399",
  statusStayed: "#94a3b8",
  statusBusted: "#f87171",
  statusFrozen: "#22d3ee",
  statusFlipped7: "#fbbf24",
  statusManual: "#818cf8",
};

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
}

// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((channel8bit) => {
    const channel = channel8bit / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
function contrastRatio(hexA, hexB) {
  const luminanceA = relativeLuminance(hexToRgb(hexA));
  const luminanceB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT_MIN = 4.5; // WCAG AA 1.4.3, normal text
const UI_MIN = 3; // WCAG AA 1.4.11, large text and non-text UI component boundaries

// [label, foreground, background, minimum ratio]
const CHECKS = [
  ["Body text on page background", PALETTE.foreground, PALETTE.background, TEXT_MIN],
  ["Body text on a surface panel/dialog", PALETTE.foreground, PALETTE.surface, TEXT_MIN],
  ["Muted text on page background", PALETTE.mutedForeground, PALETTE.background, TEXT_MIN],
  ["Muted text on a surface panel/dialog", PALETTE.mutedForeground, PALETTE.surface, TEXT_MIN],
  ["Number-card text on page background", PALETTE.cardNumber, PALETTE.background, TEXT_MIN],
  ["Modifier-card text on page background", PALETTE.cardModifier, PALETTE.background, TEXT_MIN],
  ["Action-card text on page background", PALETTE.cardAction, PALETTE.background, TEXT_MIN],
  ["Active-status text/border on page background", PALETTE.statusActive, PALETTE.background, TEXT_MIN],
  ["Stayed-status text/border on page background", PALETTE.statusStayed, PALETTE.background, TEXT_MIN],
  ["Busted-status text/border on page background", PALETTE.statusBusted, PALETTE.background, TEXT_MIN],
  ["Frozen-status text/border on page background", PALETTE.statusFrozen, PALETTE.background, TEXT_MIN],
  ["Flipped7-status text/border on page background", PALETTE.statusFlipped7, PALETTE.background, TEXT_MIN],
  ["Manual-status text/border on page background", PALETTE.statusManual, PALETTE.background, TEXT_MIN],
  ["Default border on page background (non-text UI)", PALETTE.border, PALETTE.background, UI_MIN],
  ["Default border on a surface panel/dialog (non-text UI)", PALETTE.border, PALETTE.surface, UI_MIN],
];

let failed = false;
for (const [label, foreground, background, minimum] of CHECKS) {
  const ratio = contrastRatio(foreground, background);
  const pass = ratio >= minimum;
  if (!pass) failed = true;
  const status = pass ? "PASS" : "FAIL";
  console.log(`${status}  ${label}: ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`);
}

if (failed) {
  console.error("\nOne or more color pairs fall below WCAG AA contrast.");
  process.exit(1);
}

console.log("\nAll checked color pairs meet WCAG AA contrast.");
