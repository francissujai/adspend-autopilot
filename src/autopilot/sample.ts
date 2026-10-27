// Sample mode: a recorded cycle committed under docs/samples/ so a fresh clone
// shows real decisions, traces and replays without Zetaris or Nightshift.
//
// It is used only while this machine has no ledger entries and no finished
// recordings of its own. The first live cycle replaces it. Everything served
// from it is labelled as a sample. The sample holds the ledger's public key
// only; the private signing key and the Scout HMAC secret are not published,
// so contract signatures in the sample cannot be re-checked here.

import fs from "node:fs";
import path from "node:path";
import { createPublicKey, type KeyObject } from "node:crypto";
import { ROOT } from "../env.ts";
import { Scout } from "../engines/scout/index.ts";
import { foldState, REGISTRY, replayDecision, type AutopilotState } from "./autopilot.ts";
import { verifyLedger, type LedgerEntry, type VerifyReport } from "./ledger.ts";

export const SAMPLE_CYCLE = "C-20261025002424";
export const SAMPLE_DIR = path.join(ROOT, "docs", "samples", SAMPLE_CYCLE);

const readJsonl = <T>(file: string): T[] => fs.readFileSync(file, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);

export class SampleCycle {
  readonly cycleId: string;
  readonly source: string;
  readonly publicKey: KeyObject;
  private entries: LedgerEntry[];
  private platforms: unknown;
  private scout: Scout;

  constructor(readonly dir = SAMPLE_DIR) {
    this.cycleId = path.basename(dir);
    this.source = path.relative(ROOT, dir).split(path.sep).join("/");
    this.entries = readJsonl<LedgerEntry>(path.join(dir, "ledger.jsonl"));
    this.publicKey = createPublicKey(fs.readFileSync(path.join(dir, "ledger-public-key.pem")));
    const platformFile = path.join(dir, "platform-state.json");
    this.platforms = fs.existsSync(platformFile) ? JSON.parse(fs.readFileSync(platformFile, "utf-8")) : undefined;
    // Replay re-classifies candidates; the secret only matters for signing, which replay does not compare.
    this.scout = new Scout({ intentRegistry: REGISTRY, policyPack: ["default", "adversarial-tight", "autopilot"], signingSecret: "sample-mode-not-for-signing" });
  }

  get ledger() {
    return { all: (): LedgerEntry[] => structuredClone(this.entries) };
  }

  state(): AutopilotState {
    return foldState(this.ledger.all(), this.platforms);
  }

  verify(): VerifyReport {
    return verifyLedger(this.entries, this.publicKey);
  }

  replay(decisionId: string) {
    return replayDecision(this.ledger.all(), this.publicKey, this.scout, decisionId, () => ({
      ok: false,
      reason: "sample: the HMAC secret that signed this contract is not published, so it cannot be re-checked",
    }));
  }

  /** The recorded event stream: [{ t: ms since start, e: AutopilotEvent }]. */
  events(): unknown[] {
    return readJsonl(path.join(this.dir, "events.jsonl"));
  }
}

/** True when this machine has nothing of its own to show: no ledger entries and no finished recordings. */
export function useSample(dataDir: string): boolean {
  const ledger = path.join(dataDir, "ledger", "ledger.jsonl");
  if (fs.existsSync(ledger) && fs.readFileSync(ledger, "utf-8").trim()) return false;
  const cycles = path.join(dataDir, "cycles");
  const finished = fs.existsSync(cycles) && fs.readdirSync(cycles).some((f) => f.endsWith(".events.jsonl") && fs.readFileSync(path.join(cycles, f), "utf-8").includes('"type":"cycle.done"'));
  return !finished && fs.existsSync(path.join(SAMPLE_DIR, "ledger.jsonl"));
}
