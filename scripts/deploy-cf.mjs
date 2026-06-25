import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };

// In CI we want to use CLOUDFLARE_API_TOKEN for non-interactive deploys.
// Locally we delete it so Wrangler can use browser OAuth (the token often lacks full scope).
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
if (!isCI) {
  delete env.CLOUDFLARE_API_TOKEN;
}

env.OPEN_NEXT_DEPLOY = "true";
env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, env, encoding: "utf-8", shell: true, stdio: "inherit" });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}

run("npx", ["opennextjs-cloudflare", "build"]);
// Deploy with wrangler OAuth — .env.local CLOUDFLARE_API_TOKEN lacks Workers deploy scope
run("npx", ["wrangler", "deploy"]);