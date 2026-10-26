// Ad Spend Autopilot command line.
//
//   npm run cycle [-- --no-model]       run one autopilot cycle
//   npm run decisions                   list decisions and their status
//   npm run approve -- D-0002 --by "Francis" --note "attribution confirmed"
//   npm run reject  -- D-0002 --by "Francis" --note "view-through spike, not real"
//   npm run replay  -- D-0001           re-derive a decision from its stored evidence
//   npm run verify                      verify the ledger's hash chain and signatures
//   npm run tamper-demo                 show that editing one ledger entry is detected
//   npm run demo:reset                  archive the ledger, trust memory and sandbox budgets; keep recordings

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicKey } from "node:crypto";
import { Autopilot, DATA_DIR, archiveRunState } from "./autopilot/autopilot.ts";
import { verifyLedger, type LedgerEntry } from "./autopilot/ledger.ts";

const [, , command, ...rest] = process.argv;
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positional = rest.filter((r, i) => !r.startsWith("--") && !rest[i - 1]?.startsWith("--"));
const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const icon: Record<string, string> = { "auto-executed": "AUTO ", "awaiting-approval": "HOLD ", blocked: "BLOCK", approved: "APPRV", rejected: "REJCT" };

const commands: Record<string, () => Promise<number>> = {
  async cycle() {
    const ap = new Autopilot();
    await ap.runCycle({
      useModel: !rest.includes("--no-model"),
      onEvent: (e) => {
        switch (e.type) {
          case "cycle.start":
            return console.log(`cycle ${e.cycleId} as of ${e.asOf}\nZetaris identity: ${e.identity}\nmodel: ${e.model}\n`);
          case "evidence":
            return console.log(`  ${e.id} ${e.purpose} (${e.rows} rows, ${e.ms} ms)${e.error ? ` ERROR ${e.error}` : ""}`);
          case "governance":
            return console.log(`  governance probe: ${e.allowed ? "ALLOWED (over-privileged!)" : e.unreachable ? "NOT CHECKED (Zetaris unreachable)" : "denied"} - ${e.detail}\n`);
          case "scout":
            return console.log(`  ${e.id} Scout: ${e.intent} (${e.band}) risk ${e.risk}, ${e.flags} flags, contract ${e.contract ? "signed" : "none"}, ${e.ms} ms`);
          case "rationale":
            return console.log(`  ${e.id} why (${e.by}${e.model ? `, ${e.model}` : ""}): ${e.text}`);
          case "decision":
            return console.log(`  [${icon[e.record.status]}] ${e.record.id} ${e.record.candidate.request}\n          confidence ${e.record.confidence.value}; ${e.record.reasons.join(" | ").slice(0, 220)}`);
          case "execution":
            return console.log(`          executed: ${e.receipt.ok ? e.receipt.changes.map((c) => `${c.name} ${money(c.before)} -> ${money(c.after)}`).join(", ") : `refused (${e.receipt.reason})`}`);
          case "cycle.done":
            return console.log(`\ncycle done in ${e.seconds.toFixed(0)} s: ${Object.entries(e.summary).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")}`);
        }
      },
    });
    return 0;
  },
  async decisions() {
    for (const d of new Autopilot().state().decisions) {
      console.log(`[${icon[d.status]}] ${d.id} ${d.candidate.request}  (confidence ${d.confidence.value}, risk ${d.scout.risk.level})${d.review ? `  reviewed by ${d.review.by}` : ""}`);
    }
    return 0;
  },
  async approve() {
    return review("approved");
  },
  async reject() {
    return review("rejected");
  },
  async replay() {
    const r = new Autopilot().replay(positional[0]);
    console.log(`replay ${r.decisionId} (ledger #${r.ledgerSeq} ${r.ledgerHash.slice(0, 16)}...)`);
    for (const [k, [a, b]] of Object.entries(r.compare)) console.log(`  ${r.diffs.includes(k) ? "DIFF" : "same"}  ${k.padEnd(11)} recorded=${JSON.stringify(a)}  replayed=${JSON.stringify(b)}`);
    console.log(`  evidence rows match their recorded SHA-256: ${r.evidenceIntact}`);
    console.log(`  ledger chain + signatures: ${r.ledger.ok ? "valid" : `BROKEN at #${r.ledger.firstBad?.seq}: ${r.ledger.firstBad?.reason}`}`);
    console.log(`  Scout contract signature: ${r.contract.ok ? "valid" : r.contract.reason}`);
    console.log(r.match ? "  => replay reproduces the decision exactly" : `  => replay differs: ${r.diffs.join(", ")}`);
    return r.match ? 0 : 1;
  },
  async verify() {
    const v = new Autopilot().verify();
    console.log(v.ok ? `ledger valid: ${v.entries} entries, hash chain and Ed25519 signatures check out` : `ledger BROKEN at #${v.firstBad?.seq}: ${v.firstBad?.reason}`);
    return v.ok ? 0 : 1;
  },
  async "demo-reset"() {
    const r = archiveRunState();
    console.log(r.moved.length ? `archived ${r.moved.join(", ")} to ${r.archivedTo}
The next cycle starts from an empty ledger. Saved recordings are kept.` : "nothing to archive: the ledger is already empty");
    return 0;
  },
  async "tamper-demo"() {
    const file = path.join(DATA_DIR, "ledger", "ledger.jsonl");
    const entries = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LedgerEntry);
    const target = entries.find((e) => e.type === "decision");
    if (!target) return (console.error("run a cycle first"), 1);
    const copy = structuredClone(entries);
    const t = copy.find((e) => e.seq === target.seq)!;
    const payload = t.payload as { candidate: { amountUsd: number; request: string } };
    payload.candidate.amountUsd *= 10;
    payload.candidate.request = payload.candidate.request.replace(/\$[\d,]+/, (m) => money(Number(m.replace(/[$,]/g, "")) * 10));
    const tmp = path.join(os.tmpdir(), "tampered-ledger.jsonl");
    fs.writeFileSync(tmp, copy.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const pub = createPublicKey(fs.readFileSync(path.join(DATA_DIR, "ledger", "ledger-public-key.pem")));
    console.log(`edited a COPY of the ledger: entry #${t.seq} now reads "${payload.candidate.request}" (written to ${tmp})`);
    const v = verifyLedger(copy, pub);
    console.log(v.ok ? "verification passed (unexpected!)" : `verification: BROKEN at #${v.firstBad?.seq}: ${v.firstBad?.reason}`);
    console.log(`original ledger: ${new Autopilot().verify().ok ? "still valid" : "broken"}`);
    return v.ok ? 1 : 0;
  },
};

async function review(outcome: "approved" | "rejected"): Promise<number> {
  const id = positional[0];
  const by = flag("by") ?? os.userInfo().username;
  const r = new Autopilot().review(id, { by, outcome, note: flag("note") });
  console.log(`${id} ${outcome} by ${by} (ledger #${r.approval.seq})`);
  if (r.receipt) console.log(r.receipt.ok ? `executed: ${r.receipt.changes.map((c) => `${c.name} ${money(c.before)} -> ${money(c.after)}`).join(", ")}` : `execution refused: ${r.receipt.reason}`);
  console.log(`trust memory ${r.memory.id}: ${r.memory.content}`);
  return 0;
}

const fn = commands[command ?? ""];
if (!fn) {
  console.error(`commands: ${Object.keys(commands).join(", ")}`);
  process.exitCode = 2;
} else {
  fn().then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error(`error: ${(err as Error).message}`);
      process.exitCode = 1;
    },
  );
}
