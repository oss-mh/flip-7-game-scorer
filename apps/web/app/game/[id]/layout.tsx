import { GameProvider } from "@/lib/gameProvider";

import type { ReactNode } from "react";

export default async function GameLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;

  return <GameProvider gameId={id}>{children}</GameProvider>;
}
