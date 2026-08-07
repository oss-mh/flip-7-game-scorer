// Stamps public/sw-version.json with the just-built BUILD_ID so the service
// worker (public/sw.js) opens a fresh cache per deploy. Runs after `next
// build`; public/ is served straight off disk in `next start`, so writing
// here after the build still takes effect immediately.
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const buildId = (await readFile(new URL(".next/BUILD_ID", root), "utf8")).trim();

await writeFile(new URL("public/sw-version.json", root), `${JSON.stringify({ version: buildId })}\n`);
