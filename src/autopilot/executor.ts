// Sandbox ad platforms. Budget writes go to a local JSON state that stands in
// for the Meta and Google Ads APIs. The executor refuses to act without a
// Scout execution contract that verifies: right signature, not expired,
// approvals present for high-risk moves, and within the contract's scope.

import fs from "node:fs";
import path from "node:path";
import type { ExecutionContract, Scout } from "../engines/scout/index.ts";
import type { Candidate } from "./optimizer.ts";

export interface PlatformState {
  budgets: Record<string, { platform: string; name: string; dailyBudget: number }>;
  changes: { at: string; lineId: string; before: number; after: number; contractId: string }[];
}

export interface ExecutionReceipt {
  ok: boolean;
  reason?: string;
  changes: { platform: string; lineId: string; name: string; before: number; after: number }[];
  contractId?: string;
  at: string;
}

export class SandboxPlatforms {
  readonly file: string;
  state: PlatformState;

  constructor(dir: string, seed: { platform: string; id: string; name: string; dailyBudget: number }[]) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "platform-state.json");
    if (fs.existsSync(this.file)) this.state = JSON.parse(fs.readFileSync(this.file, "utf-8"));
    else {
      this.state = { budgets: Object.fromEntries(seed.map((l) => [l.id, { platform: l.platform, name: l.name, dailyBudget: l.dailyBudget }])), changes: [] };
      this.save();
    }
  }

  private save() {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  apply(scout: Scout, contract: ExecutionContract | undefined, c: Candidate): ExecutionReceipt {
    const at = new Date().toISOString();
    if (!contract) return { ok: false, reason: "no execution contract", changes: [], at };
    const check = scout.verifyContract(contract);
    if (!check.ok) return { ok: false, reason: `contract ${check.reason}`, changes: [], at, contractId: contract.contractId };
    if (!contract.scope.capabilities.includes("platform.budget.write")) return { ok: false, reason: "contract scope lacks platform.budget.write", changes: [], at };
    if ((contract.scope.budget?.costMaxUSD ?? Infinity) < c.amountUsd) return { ok: false, reason: "amount exceeds contract budget scope", changes: [], at };
    const changes: ExecutionReceipt["changes"] = [];
    for (const [line, delta] of [[c.from, -c.amountUsd], [c.to, c.amountUsd]] as const) {
      if (!line) continue;
      const b = this.state.budgets[line.id];
      if (!b) return { ok: false, reason: `unknown line ${line.id}`, changes: [], at };
      const after = Math.round((b.dailyBudget + delta) * 100) / 100;
      if (after < 0) return { ok: false, reason: `${line.name} budget would go negative`, changes: [], at };
      changes.push({ platform: b.platform, lineId: line.id, name: b.name, before: b.dailyBudget, after });
    }
    for (const ch of changes) {
      this.state.budgets[ch.lineId].dailyBudget = ch.after;
      this.state.changes.push({ at, lineId: ch.lineId, before: ch.before, after: ch.after, contractId: contract.contractId });
    }
    this.save();
    return { ok: true, changes, contractId: contract.contractId, at };
  }
}
