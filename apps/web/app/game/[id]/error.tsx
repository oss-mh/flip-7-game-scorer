"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";

import { GameRecoveryPanel } from "@/components/GameRecoveryPanel";

/**
 * The React error boundary for everything under a game route — page.tsx,
 * history/page.tsx and replay/page.tsx, all three, since none of them
 * declare their own `error.tsx` — catching a render-time crash rather than
 * the load/fold failures `gameProvider.tsx` already turns into the
 * `error`/`degraded` statuses `GameRecoveryPanel` handles there too. Same
 * panel either way, so recovery looks identical regardless of which layer
 * caught the failure. See AGENTS.md issue #86.
 */
export default function GameError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <GameRecoveryPanel error={error} gameId={id} onReload={reset} />;
}
