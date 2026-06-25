import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.join(__dirname, "..", "contracts", "MirrorRouter.sol"),
  "utf-8",
);

const input = {
  language: "Solidity",
  sources: { "MirrorRouter.sol": { content: source } },
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors?.some((e) => e.severity === "error")) {
  console.error(output.errors.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}

const artifact = output.contracts["MirrorRouter.sol"].MirrorRouter;
const outDir = path.join(__dirname, "..", "lib", "contracts");
mkdirSync(outDir, { recursive: true });

writeFileSync(
  path.join(outDir, "mirror-router-artifact.json"),
  JSON.stringify({ abi: artifact.abi, bytecode: artifact.evm.bytecode.object }, null, 2),
);

console.log("Compiled MirrorRouter → lib/contracts/mirror-router-artifact.json");