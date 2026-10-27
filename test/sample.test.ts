// Sample mode: the committed recorded cycle must verify, replay exactly and
// contain no secrets, and the server must only fall back to it on a machine
// with no ledger or recordings of its own.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SAMPLE_CYCLE, SAMPLE_DIR, SampleCycle, useSample } from "../src/autopilot/sample.ts";

test("sample cycle: ledger verifies with the committed public key and holds the three demo decisions", () => {
  const s = new SampleCycle();
  assert.deepEqual(s.verify(), { ok: true, entries: 7 });
  const st = s.state();
  assert.equal(st.cycles[0].cycleId, SAMPLE_CYCLE);
  const byId = Object.fromEntries(st.decisions.map((d) => [d.id, d]));
  assert.equal(byId["D-0001"].status, "auto-executed");
  assert.equal(byId["D-0001"].executions[0].ok, true);
  assert.equal(byId["D-0002"].status, "rejected", "the held $5,000 move was later rejected by a reviewer");
  assert.equal(byId["D-0003"].status, "blocked");
  assert.equal(byId["D-0003"].scout.contract, undefined, "a blocked move gets no contract");
  for (const d of st.decisions) assert.equal(d.rationale.by, "nemotron", `${d.id} rationale was written by Nemotron`);
  const done = s.events().at(-1) as { e: { type: string } };
  assert.equal(done.e.type, "cycle.done");
});

test("sample cycle: every decision replays exactly from the stored evidence", () => {
  const s = new SampleCycle();
  for (const id of ["D-0001", "D-0002", "D-0003"]) {
    const r = s.replay(id);
    assert.ok(r.match, `${id} diffs: ${r.diffs.join(", ")}`);
    assert.ok(r.evidenceIntact && r.ledger.ok);
  }
});

test("sample cycle: no private key or HMAC secret is committed", () => {
  for (const f of fs.readdirSync(SAMPLE_DIR)) {
    const text = fs.readFileSync(path.join(SAMPLE_DIR, f), "utf-8");
    assert.doesNotMatch(text, /PRIVATE KEY/, f);
    assert.doesNotMatch(f, /secret|ed25519\.pem$/, f);
  }
});

test("sample mode applies only when there is no local ledger and no finished recording", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilot-sample-"));
  assert.equal(useSample(dir), true, "empty data dir");
  fs.mkdirSync(path.join(dir, "cycles"));
  fs.writeFileSync(path.join(dir, "cycles", "C-1.events.jsonl"), '{"t":0,"e":{"type":"cycle.start"}}\n');
  assert.equal(useSample(dir), true, "an unfinished recording does not count");
  fs.appendFileSync(path.join(dir, "cycles", "C-1.events.jsonl"), '{"t":1,"e":{"type":"cycle.done"}}\n');
  assert.equal(useSample(dir), false, "a finished recording replaces the sample");
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "autopilot-sample-"));
  fs.mkdirSync(path.join(dir2, "ledger"));
  fs.writeFileSync(path.join(dir2, "ledger", "ledger.jsonl"), "{}\n");
  assert.equal(useSample(dir2), false, "a local ledger replaces the sample");
});
