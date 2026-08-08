/**
 * A plain-text, copyable snapshot of an error for a bug report — this app
 * has no telemetry/backend to phone errors home to (and never will without
 * asking first, see AGENTS.md), so "reported with enough context to
 * reproduce" means giving the person hitting the error something they can
 * paste into an issue themselves.
 */
export interface ErrorReport {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly gameId?: string;
  readonly at: string;
}

export function buildErrorReport(error: Error, gameId?: string): ErrorReport {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    gameId,
    at: new Date().toISOString(),
  };
}

export function formatErrorReport(report: ErrorReport): string {
  const lines = [
    "Flip 7 Scorekeeper — error report",
    `Time: ${report.at}`,
    report.gameId ? `Game: ${report.gameId}` : null,
    `${report.name}: ${report.message}`,
    report.stack ? `\n${report.stack}` : null,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
