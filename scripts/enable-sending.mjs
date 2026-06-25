import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
delete env.CLOUDFLARE_API_TOKEN;

function run(args) {
  const r = spawnSync("npx", ["wrangler", ...args], {
    cwd: root,
    env,
    encoding: "utf-8",
    shell: true,
  });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return r.status ?? 1;
}

const enable = run(["email", "sending", "enable", "alphamirror.trade"]);
if (enable !== 0) process.exit(enable);

run(["email", "sending", "dns", "get", "alphamirror.trade"]);
run(["email", "sending", "list"]);