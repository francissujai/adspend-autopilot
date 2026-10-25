// Scout Intent engine. Pipeline per the spec: Sense -> Interpret -> Guard ->
// Route -> Recommend -> signed execution contract.
//
// Interpret scores every registered intent:
//   score = 0.40 lexical + 0.35 semantic + 0.20 contextual + 0.05 recency - riskPenalty
// Bands: high >= 0.80, medium >= 0.55, low >= 0.40, reject < 0.40 (-> GENERAL).
// Guard runs the policy packs over the prompt AND any untrusted text the
// request depends on; an injection blocks, everything else lifts risk.
// Contracts are HMAC-SHA256 signed over canonical JSON and expire after a TTL;
// downstream code must call verifyContract() before acting.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { cosine, embed, jaccard, tokenize } from "../hmem/text.ts";
import { PACKS } from "./packs.ts";
import type { Approval, Candidate, Decision, DecideInput, ExecutionContract, GuardFlag, IntentDef, IntentRegistry, PolicyPack, RiskLevel, ToolStep } from "./types.ts";

export interface ScoutOptions {
  intentRegistry: string | IntentRegistry;
  policyPack?: string | (string | PolicyPack)[];
  signingSecret?: string;
  clock?: () => number;
  ttlMs?: number;
  /** capability -> concrete tool name; defaults to the capability itself. */
  tools?: Record<string, string>;
}

const BANDS = { high: 0.8, medium: 0.55, low: 0.4 };
const LEVELS: RiskLevel[] = ["low", "medium", "high", "block"];
const lift = (l: RiskLevel, by = 1): RiskLevel => LEVELS[Math.min(2, LEVELS.indexOf(l) + by)] ?? l;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20 };

interface Prepared {
  def: IntentDef;
  exampleTokens: Set<string>[];
  exampleVecs: number[][];
  descTokens: Set<string>;
}

export class Scout {
  readonly registry: IntentRegistry;
  readonly packs: PolicyPack[];
  private prepared: Prepared[];
  private secret: string;
  private clock: () => number;
  private ttlMs: number;
  private tools: Record<string, string>;
  private ulidLast = 0;

  constructor(opts: ScoutOptions) {
    this.registry = typeof opts.intentRegistry === "string" ? (JSON.parse(fs.readFileSync(opts.intentRegistry, "utf-8")) as IntentRegistry) : opts.intentRegistry;
    const packNames = opts.policyPack === undefined ? ["default"] : Array.isArray(opts.policyPack) ? opts.policyPack : [opts.policyPack];
    this.packs = packNames.map((p) => {
      if (typeof p !== "string") return p;
      const pack = PACKS[p];
      if (!pack) throw new Error(`Scout: unknown policy pack ${p}`);
      return pack;
    });
    this.secret = opts.signingSecret ?? process.env.SCOUT_SIGNING_SECRET ?? "scout-dev-secret-change-me";
    this.clock = opts.clock ?? Date.now;
    this.ttlMs = opts.ttlMs ?? 5 * 60_000;
    this.tools = opts.tools ?? {};
    this.prepared = this.registry.intents.map((def) => ({
      def,
      exampleTokens: def.examples.map((e) => new Set(tokenize(e))),
      exampleVecs: def.examples.map((e) => embed(e)),
      descTokens: new Set(tokenize(def.description)),
    }));
    this.selfTest();
  }

  /** Startup self-test (spec): every example must classify as its own intent. */
  private selfTest(): void {
    for (const p of this.prepared) {
      for (const ex of p.def.examples.slice(0, 1)) {
        const top = this.score(ex, { role: "*" }, p.def.surfaces[0] ?? "chat")[0];
        if (top && top.intent !== p.def.id && top.score > 0.99) throw new Error(`Scout self-test: "${ex}" resolves to ${top.intent}, registered under ${p.def.id}`);
      }
    }
  }

  get policyPackVersion(): string {
    return this.packs.map((p) => `${p.name}@${p.version}`).join("+");
  }

  // ---------------------------------------------------------------- interpret

  score(text: string, user: { role: string }, surface: string): Candidate[] {
    const qTokens = tokenize(text);
    const qSet = new Set(qTokens);
    const qVec = embed(text);
    const out: Candidate[] = [];
    for (const p of this.prepared) {
      if (p.def.id === "GENERAL") continue;
      let lexical = 0;
      p.exampleTokens.forEach((ex) => {
        if (!ex.size || !qSet.size) return;
        let inter = 0;
        for (const t of qSet) if (ex.has(t)) inter++;
        const containment = inter / ex.size;
        lexical = Math.max(lexical, 0.5 * jaccard(qSet, ex) + 0.5 * containment);
      });
      lexical = Math.max(lexical, 0.6 * jaccard(qSet, p.descTokens));
      const semantic = Math.max(0, ...p.exampleVecs.map((v) => cosine(qVec, v)));
      const surfaceOk = p.def.surfaces.includes(surface) || p.def.surfaces.includes("*");
      const roleOk = p.def.roles.includes("*") || p.def.roles.includes(user.role) || user.role === "*";
      const contextual = (surfaceOk ? 0.5 : 0.25) + (roleOk ? 0.5 : 0.3);
      const riskPenalty = p.def.riskClass === "high" ? 0.02 : 0;
      const score = 0.4 * lexical + 0.35 * semantic + 0.2 * contextual + 0.05 * 0.5 - riskPenalty;
      out.push({ intent: p.def.id, score: round(score), lexical: round(lexical), semantic: round(semantic), contextual: round(contextual) });
    }
    return out.sort((a, b) => b.score - a.score || a.intent.localeCompare(b.intent));
  }

  private intent(id: string): IntentDef | undefined {
    return this.registry.intents.find((i) => i.id === id);
  }

  private extractParameters(def: IntentDef | undefined, text: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    const props = def?.parameters?.properties ?? {};
    for (const [name, spec] of Object.entries(props)) {
      if (spec.enum) {
        const hit = spec.enum.find((v) => new RegExp(`\\b${v}s?\\b`, "i").test(text));
        if (hit) params[name] = hit;
      } else if (/amount|usd|budget/.test(name)) {
        const m = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k)?/i);
        if (m) params[name] = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
      } else if (spec.type === "integer") {
        // Counts only: a free-form number (ratio, share) is never guessed from text.
        const m = text.match(/\b(\d+)\b/) ?? text.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "i"));
        if (m) params[name] = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
      }
    }
    return params;
  }

  // ---------------------------------------------------------------- guard

  guard(input: DecideInput, def: IntentDef | undefined, parameters: Record<string, unknown>) {
    const flags: GuardFlag[] = [];
    const texts = [{ source: "prompt", text: input.prompt }, ...(input.untrusted ?? [])];
    for (const pack of this.packs) {
      for (const { kind, pattern } of pack.injection) {
        for (const t of texts) {
          const m = t.text.match(pattern);
          if (m) flags.push({ layer: "injection", kind, outcome: "block", evidence: `${t.source}: "${m[0].slice(0, 80)}"` });
        }
      }
    }
    const approvalsRequired: string[] = [];
    let level: RiskLevel = def?.riskClass ?? "low";
    if (def && !(def.roles.includes("*") || def.roles.includes(input.user.role))) {
      flags.push({ layer: "policy", kind: "role-not-registered", outcome: "warn", evidence: `role ${input.user.role} not in ${def.roles.join(",")}` });
      level = lift(level);
    }
    if (def && !(def.surfaces.includes("*") || def.surfaces.includes(input.surface))) {
      flags.push({ layer: "scope", kind: "surface-not-registered", outcome: "warn", evidence: `surface ${input.surface}` });
    }
    for (const pack of this.packs) {
      if (!def) continue;
      for (const [param, lim] of Object.entries(pack.limits?.[def.id] ?? {})) {
        const v = Number(parameters[param]);
        if (!Number.isFinite(v)) continue;
        if (lim.hardMax !== undefined && v > lim.hardMax) {
          flags.push({ layer: "scope", kind: "hard-limit", outcome: "block", evidence: `${param}=${v} > hard max ${lim.hardMax} (${pack.name})` });
        } else if (lim.autoMax !== undefined && v > lim.autoMax) {
          flags.push({ layer: "scope", kind: "above-auto-limit", outcome: "warn", evidence: `${param}=${v} > auto max ${lim.autoMax} (${pack.name})` });
          level = "high";
          if (!approvalsRequired.includes("operator-review")) approvalsRequired.push("operator-review");
        }
      }
      if (pack.requireApproval?.includes(def.id) && !approvalsRequired.includes("operator-review")) approvalsRequired.push("operator-review");
    }
    if (def?.riskClass === "high" && !approvalsRequired.includes("operator-review")) approvalsRequired.push("operator-review");
    if (flags.some((f) => f.outcome === "block")) level = "block";
    return { level, flags, approvalsRequired };
  }

  // ---------------------------------------------------------------- decide

  decide(input: DecideInput): Decision {
    const t0 = performance.now();
    const candidates = this.score(input.prompt, input.user, input.surface);
    const classifyMs = round(performance.now() - t0);
    const top = candidates[0];
    const band: Decision["band"] = !top || top.score < BANDS.low ? "reject" : top.score < BANDS.medium ? "low" : top.score < BANDS.high ? "medium" : "high";
    const primaryId = band === "reject" ? "GENERAL" : top.intent;
    const def = this.intent(primaryId);
    const confidence = band === "reject" ? round(1 - (top?.score ?? 0)) : top.score;

    // Multi-intent: score clauses separately; keep distinct intents in the medium band or above.
    const spans = input.prompt.split(/,\s*(?:and\s+)?|\s+and\s+(?=\w)/i).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
    const intents: Decision["intents"] = [];
    if (spans.length > 1) {
      for (const span of spans) {
        const c = this.score(span, input.user, input.surface)[0];
        if (c && c.score >= BANDS.medium && !intents.some((i) => i.intent === c.intent)) intents.push({ intent: c.intent, score: c.score, span });
      }
    }
    if (!intents.some((i) => i.intent === primaryId)) intents.unshift({ intent: primaryId, score: confidence, span: input.prompt });

    const parameters = { ...this.extractParameters(def, input.prompt), ...(input.parameters ?? {}) };
    const risk = this.guard(input, def, parameters);

    const toolPlan: ToolStep[] =
      risk.level === "block"
        ? []
        : intents.flatMap((i) => (this.intent(i.intent)?.capabilities ?? []).map((capability) => ({ capability, tool: this.tools[capability] ?? capability, fromIntent: i.intent })));
    const dedupedPlan = toolPlan.filter((s, i) => toolPlan.findIndex((x) => x.capability === s.capability) === i);

    let clarification: Decision["clarification"];
    const second = candidates[1];
    if (risk.level !== "block") {
      // Two near-tied intents are not ambiguity when they cover different clauses (multi-intent).
      const tooClose = band === "medium" && second && top.score - second.score < 0.05 && intents.length < 2;
      const highRiskUnsure = def?.riskClass === "high" && confidence < 0.95;
      if (band === "low" || band === "reject" || tooClose || highRiskUnsure) {
        clarification = {
          question: band === "reject" ? "I'm not sure what you'd like me to do. Which of these is closest?" : `Did you mean ${this.intent(top.intent)?.description ?? top.intent}?`,
          options: candidates.slice(0, 3).map((c) => ({ label: this.intent(c.intent)?.description ?? c.intent, intent: c.intent })),
        };
      }
    }

    const executionContract = risk.level === "block" ? undefined : this.issue({ input, primaryId, confidence, parameters, candidates, risk: risk as Decision["risk"] & { level: Exclude<RiskLevel, "block"> }, toolPlan: dedupedPlan });
    return { candidates, band, intents, parameters, risk, toolPlan: dedupedPlan, clarification, executionContract, timings: { classifyMs } };
  }

  // ---------------------------------------------------------------- contracts

  private issue(a: {
    input: DecideInput;
    primaryId: string;
    confidence: number;
    parameters: Record<string, unknown>;
    candidates: Candidate[];
    risk: { level: Exclude<RiskLevel, "block">; flags: GuardFlag[]; approvalsRequired: string[] };
    toolPlan: ToolStep[];
  }): ExecutionContract {
    const now = this.clock();
    const amount = Number(a.parameters.amount_usd);
    const body: Omit<ExecutionContract, "signature"> = {
      contractId: this.ulid(now),
      traceId: randomBytes(8).toString("hex"),
      intent: {
        primary: { id: a.primaryId, confidence: a.confidence },
        parameters: a.parameters,
        alternates: a.candidates.filter((c) => c.intent !== a.primaryId).slice(0, 2).map((c) => ({ id: c.intent, confidence: c.score })),
      },
      risk: { level: a.risk.level, flags: a.risk.flags, approvalsRequired: a.risk.approvalsRequired, approvals: [] },
      toolPlan: a.toolPlan,
      scope: { user: a.input.user.id, surface: a.input.surface, capabilities: [...new Set(a.toolPlan.map((s) => s.capability))], ...(Number.isFinite(amount) ? { budget: { costMaxUSD: amount } } : {}) },
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      registryVersion: this.registry.version,
      policyPackVersion: this.policyPackVersion,
      signedBy: "scout",
    };
    return { ...body, signature: this.sign(body) };
  }

  /** Records a human decision on a contract and re-signs it. */
  recordApproval(contract: ExecutionContract, approval: Approval): ExecutionContract {
    const check = this.verifyContract(contract, { requireApprovals: false });
    if (!check.ok) throw new Error(`Scout: cannot approve an invalid contract (${check.reason})`);
    const { signature: _s, ...body } = contract;
    const next = { ...body, risk: { ...body.risk, approvals: [...body.risk.approvals, approval] } };
    return { ...next, signature: this.sign(next) };
  }

  verifyContract(contract: ExecutionContract, opts: { now?: number; requireApprovals?: boolean } = {}): { ok: boolean; reason?: string } {
    const { signature, ...body } = contract;
    const expected = this.sign(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
    if ((opts.now ?? this.clock()) >= Date.parse(contract.expiresAt)) return { ok: false, reason: "expired" };
    if (opts.requireApprovals !== false) {
      for (const kind of contract.risk.approvalsRequired) {
        const a2 = contract.risk.approvals.find((x) => x.kind === kind || (kind === "operator-review" && x.kind === "operator-review"));
        if (!a2) return { ok: false, reason: "missing-approval" };
        if (a2.decision === "rejected") return { ok: false, reason: "rejected" };
      }
    }
    return { ok: true };
  }

  private sign(body: unknown): string {
    return `hmac-sha256:${createHmac("sha256", this.secret).update(canonicalJson(body)).digest("hex")}`;
  }

  /** Monotonic ULID (Crockford base32: 10 chars time + 16 chars randomness). */
  private ulid(now: number): string {
    const t = Math.max(now, this.ulidLast + 1);
    this.ulidLast = t;
    const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let time = "";
    for (let i = 9, v = t; i >= 0; i--, v = Math.floor(v / 32)) time = A[v % 32] + time;
    const rnd = [...randomBytes(16)].map((b) => A[b % 32]).join("");
    return time + rnd;
  }
}

/** JSON with object keys sorted at every level: the bytes that get signed. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
