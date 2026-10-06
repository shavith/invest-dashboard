#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { exitStatusFromChild, projectRoot } from "./with-app-env.mjs";

// Resolve Vite's JS entrypoint instead of spawning a .cmd shim on Windows.
// Retain the shared app-environment wrapper used by the existing build.
const root = projectRoot();
const require = createRequire(import.meta.url);
const viteCli = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
const built = spawnSync(
  process.execPath,
  [join(root, "scripts", "with-app-env.mjs"), process.execPath, viteCli, "build"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      INVEST_DEPLOY_TARGET: "sites",
      NITRO_PRESET: "cloudflare_module",
    },
  },
);
if (built.error) throw built.error;
const status = exitStatusFromChild(built.status, built.signal);
if (status !== 0) process.exit(status);

// Nitro emits the module Worker as index.mjs. Sites' standard entrypoint
// re-exports that same Worker object; it does not start a Node HTTP server.
const entry = join(root, "dist", "server", "index.mjs");
if (!statSync(entry).isFile()) throw new Error("Nitro did not emit a module Worker.");
if (!statSync(join(root, "dist", "client")).isDirectory()) {
  throw new Error("Nitro did not emit the client assets.");
}
const sitesEntry = join(root, "dist", "server", "index.js");
writeFileSync(sitesEntry, 'export { default } from "./index.mjs";\n');
const checked = spawnSync(process.execPath, ["--check", sitesEntry], { stdio: "inherit" });
if (checked.error) throw checked.error;
const checkStatus = exitStatusFromChild(checked.status, checked.signal);
if (checkStatus !== 0) process.exit(checkStatus);
console.log("[sites] Worker entrypoint and client assets prepared.");
console.log("[sites] Publication still requires a registered Site and the bundled Sites workflow.");
