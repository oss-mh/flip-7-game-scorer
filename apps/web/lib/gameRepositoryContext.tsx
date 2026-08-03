"use client";

import { createContext, useContext, useMemo } from "react";

import { createGameRepository } from "./compositionRoot";

import type { GameRepository } from "@flip-7/engine";
import type { ReactNode } from "react";

/**
 * Exposes the `GameRepository` port type only — never the concrete adapter
 * class selected in compositionRoot.ts. See AGENTS.md, "apps/web never
 * imports a concrete adapter".
 */
const GameRepositoryContext = createContext<GameRepository | null>(null);

export function GameRepositoryProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => createGameRepository(), []);

  return (
    <GameRepositoryContext.Provider value={repository}>{children}</GameRepositoryContext.Provider>
  );
}

export function useGameRepository(): GameRepository {
  const repository = useContext(GameRepositoryContext);
  if (repository === null) {
    throw new Error("useGameRepository must be used within a GameRepositoryProvider");
  }
  return repository;
}
