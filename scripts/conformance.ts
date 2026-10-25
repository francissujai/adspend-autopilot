// Runs the official Meterless test suites against this repo's own engines and
// saves the scorecards to conformance/results/:
//   Markovian  conformance/markovian/runner.ts   (MARKOVIAN_IMPL)
//   H-MEM      conformance/hmem/runner.ts        (HMEM_IMPL)
//   Scout      evals/scout/runner/index.ts all   (SCOUT_IMPL)
//
//   npm run conformance

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suites = [
  { name: "markovian", envVar: "MARKOVIAN_IMPL", impl: "src/engines/markovian/index.ts", runner: "conformance/markovian/runner.ts", args: [] as string[] },
  { name: "hmem", envVar: "HMEM_IMPL", impl: "src/engines/hmem/index.ts", runner: "conformance/hmem/runner.ts", args: [] },
  { name: "scout", envVar: "SCOUT_IMPL", impl: "src/engines/scout/index.ts", runner: "evals/scout/runner/index.ts", args: ["all"] },
];

const outDir = path.join(root, "conformance", "results");
fs.mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const s of suites) {
  const implPath = path.join(root, s.impl).replaceAll("\\", "/");
  const r = spawnSync(process.execPath, ["--import", "tsx", path.join(root, s.runner), ...s.args], {
    cwd: path.dirname(path.join(root, s.runner)),
    env: { ...process.env, [s.envVar]: implPath },
    encoding: "utf-8",
  });
  let out = `${r.stdout}${r.stderr}`;
  if (s.name === "scout") {
    const report = path.join(root, "evals/scout/reports/latest.md");
    if (fs.existsSync(report)) out += `\n${fs.readFileSync(report, "utf-8")}`;
  }
  process.stdout.write(out);
  fs.writeFileSync(path.join(outDir, `${s.name}.txt`), `$ ${s.envVar}=${s.impl} npx tsx ${s.runner} ${s.args.join(" ")}\n# ${new Date().toISOString()}\n${out}`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
