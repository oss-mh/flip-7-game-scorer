"use client";

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"] as const;

/**
 * The digit grid shared by every round-score keypad (#78, #79) — same keys,
 * same backspace glyph, same leading-zero-safe layout — so a future change
 * to one (a max-length guard, say) doesn't have to be remembered and
 * re-applied at every call site. Callers still own their own value state:
 * the bulk entry panel tracks one string per player and adds a "Next" key,
 * a single-lane entry tracks just one string, and forcing those two shapes
 * into a shared hook would cost more than the few lines it'd save.
 */
export function NumericKeypad({
  onDigit,
  onBackspace,
  extraKeys = [],
  onExtraKey,
  disabled = false,
  compact = false,
}: {
  readonly onDigit: (digit: string) => void;
  readonly onBackspace: () => void;
  /** Extra keys appended after the digit grid — e.g. "Next" to cycle players. */
  readonly extraKeys?: readonly string[];
  readonly onExtraKey?: (key: string) => void;
  readonly disabled?: boolean;
  /** Smaller touch targets for a single-lane inline entry vs. the full-width bulk panel. */
  readonly compact?: boolean;
}) {
  const keys: readonly string[] = [...DIGIT_KEYS, ...extraKeys];
  return (
    <div className={`grid grid-cols-3 ${compact ? "gap-1" : "gap-2"}`}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (key === "⌫") onBackspace();
            else if ((DIGIT_KEYS as readonly string[]).includes(key)) onDigit(key);
            else onExtraKey?.(key);
          }}
          className={
            compact
              ? "border-border rounded border py-2 text-sm font-semibold"
              : "border-border rounded-lg border-2 py-3 text-lg font-semibold"
          }
        >
          {key}
        </button>
      ))}
    </div>
  );
}
