import type { PlayerRoundStatus } from "@flip-7/engine";

/**
 * Icon + label + color per status so nothing is distinguishable by colour
 * alone (#73's first acceptance criterion — colourblind-safe at a glance).
 */
const STATUS_META: Record<PlayerRoundStatus, { readonly label: string; readonly icon: string }> = {
  active: { label: "In play", icon: "●" },
  stayed: { label: "Stayed", icon: "✓" },
  busted: { label: "Bust", icon: "✕" },
  frozen: { label: "Frozen", icon: "❄" },
  flipped7: { label: "Flip 7!", icon: "★" },
};

const STATUS_CLASSES: Record<PlayerRoundStatus, string> = {
  active: "text-status-active border-status-active/60",
  stayed: "text-status-stayed border-status-stayed/60",
  busted: "text-status-busted border-status-busted/60",
  frozen: "text-status-frozen border-status-frozen/60",
  flipped7: "text-status-flipped7 border-status-flipped7 animate-pulse",
};

export function StatusBadge({ status }: { readonly status: PlayerRoundStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
