#!/usr/bin/env node
// Prints a markdown table of every workspace's coverage-summary.json
// (produced by `pnpm test`'s vitest json-summary reporter). Run from the
// repo root; CI appends the output to $GITHUB_STEP_SUMMARY.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKSPACE_ROOTS = ["apps", "packages"];
const METRICS = ["statements", "branches", "functions", "lines"];

function findCoverageSummaries() {
  const found = [];
  for (const root of WORKSPACE_ROOTS) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const summaryPath = join(root, name, "coverage", "coverage-summary.json");
      if (existsSync(summaryPath)) {
        found.push({ workspace: `${root}/${name}`, summaryPath });
      }
    }
  }
  return found;
}

function formatPct(pct) {
  return typeof pct === "number" ? `${pct.toFixed(2)}%` : String(pct);
}

function main() {
  const summaries = findCoverageSummaries();
  if (summaries.length === 0) {
    console.log("No coverage reports found.");
    return;
  }

  console.log("## Coverage\n");
  for (const { workspace, summaryPath } of summaries) {
    const { total } = JSON.parse(readFileSync(summaryPath, "utf8"));
    console.log(`### ${workspace}\n`);
    console.log("| Metric | Coverage | Covered / Total |");
    console.log("| --- | --- | --- |");
    for (const metric of METRICS) {
      const { pct, covered, total: totalCount } = total[metric];
      console.log(`| ${metric} | ${formatPct(pct)} | ${covered} / ${totalCount} |`);
    }
    console.log("");
  }
}

main();
