#!/usr/bin/env node
/**
 * Build static export for GitHub Pages.
 * - Temporarily moves app/api out of the way (API routes can't be statically exported).
 * - Sets BUILD_STATIC=true so next.config enables output: 'export'.
 * - Runs next build.
 * - Restores app/api .
 * - The resulting ./out directory contains the static website files.
 *
 * After build, push the contents of `out/` (or the whole repo + use GH Action)
 * to GitHub and enable GitHub Pages.
 *
 * API calls in the frontend must use NEXT_PUBLIC_API_BASE pointing at your
 * Cloudflare Worker (e.g. the alpha-wallet-mirror worker or a dedicated api.* subdomain).
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const apiDir = path.join(root, "app", "api");
const apiBackup = path.join(root, ".api-backup");

// Additional routes that are force-dynamic / require runtime server (not suitable for pure static GH Pages)
const dynamicRoutes = [
  "dashboard",
  "status",
  "support",
];
const dynamicBackups = new Map();

const env = {
  ...process.env,
  BUILD_STATIC: "true",
  NEXT_PUBLIC_STATIC_EXPORT: "true",
};

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (exit ${res.status})`);
  }
}

console.log("=== Alpha Mirror static export for GitHub Pages ===");

if (fs.existsSync(apiBackup)) {
  console.log("Cleaning previous api backup...");
  fs.rmSync(apiBackup, { recursive: true, force: true });
}

if (fs.existsSync(apiDir)) {
  console.log("Backing up app/api (API routes are incompatible with static export)...");
  fs.cpSync(apiDir, apiBackup, { recursive: true });
  fs.rmSync(apiDir, { recursive: true, force: true });
} else {
  console.log("No app/api directory found (already clean).");
}

// Backup dynamic app routes
for (const route of dynamicRoutes) {
  const routeDir = path.join(root, "app", route);
  const bDir = path.join(root, `.dynamic-backup-${route}`);
  if (fs.existsSync(routeDir)) {
    console.log(`Temporarily backing up app/${route} (force-dynamic, not for static export)...`);
    if (fs.existsSync(bDir)) fs.rmSync(bDir, { recursive: true, force: true });
    fs.cpSync(routeDir, bDir, { recursive: true });
    fs.rmSync(routeDir, { recursive: true, force: true });
    dynamicBackups.set(route, bDir);
  }
}

try {
  console.log("\nBuilding with Next.js static export (output: 'export')...");
  run("npx", ["next", "build"]);

  console.log("\nStatic build completed. Output is in ./out/");
  console.log("You can serve it locally for testing: npx serve out");
} finally {
  // Restore API
  if (fs.existsSync(apiBackup)) {
    console.log("\nRestoring app/api ...");
    if (fs.existsSync(apiDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
    }
    fs.cpSync(apiBackup, apiDir, { recursive: true });
    fs.rmSync(apiBackup, { recursive: true, force: true });
    console.log("Restored app/api.");
  }

  // Restore dynamic routes
  for (const [route, bDir] of dynamicBackups.entries()) {
    const routeDir = path.join(root, "app", route);
    if (fs.existsSync(bDir)) {
      console.log(`Restoring app/${route} ...`);
      if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true });
      fs.cpSync(bDir, routeDir, { recursive: true });
      fs.rmSync(bDir, { recursive: true, force: true });
    }
  }
}

console.log(`
=== Next steps ===
1. Review ./out/ (this is your GitHub Pages content).
2. Commit your source to a GitHub repo (recommended: separate or same repo).
3. Add a GitHub Action (or manually push the out/ to a gh-pages branch or use the workflow).
4. In GitHub repo → Settings → Pages:
   - Source: GitHub Actions (or Deploy from a branch)
   - Custom domain: alphamirror.trade
5. Update DNS in Cloudflare (see docs or run adapted fix-dns for GitHub IPs).
6. Set NEXT_PUBLIC_API_BASE=https://...your-worker... when building if you want live API calls from the static site.
`);

process.exit(0);