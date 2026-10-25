// Policy packs. "Warn loudly, block sparingly": injection patterns block,
// everything else lifts risk or asks for a human.

import type { PolicyPack } from "./types.ts";

export const DEFAULT_PACK: PolicyPack = {
  name: "default",
  version: 1,
  injection: [
    { kind: "instruction-override", pattern: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any)\b[^.\n]{0,30}\b(instructions?|rules?|prompts?|limits?|guidance|policies|approvals?)\b/i },
    { kind: "instruction-override", pattern: /\bignore (all )?(previous|prior|above)\b/i },
    { kind: "instruction-override", pattern: /\bdisregard (the |all )?(user|system|instructions|rules|above)\b/i },
    { kind: "mode-switch", pattern: /\byou are now\b[^.\n]{0,40}\b(unrestricted|jailbroken|developer mode|dan|admin|root)\b/i },
    { kind: "role-confusion", pattern: /<\/?\s*(system|user|assistant)\s*>/i },
    { kind: "role-confusion", pattern: /\[\/?INST\]/ },
    { kind: "role-confusion", pattern: /\bpretend (to be|you are)\b[^.\n]{0,20}\b(the )?(system|admin|administrator|developer|root)\b/i },
    { kind: "exfiltration", pattern: /\b(reveal|print|dump|show|send)\b[^.\n]{0,40}\b(api keys?|credentials|secrets?|passwords?|tokens?|system prompt)\b/i },
    { kind: "privilege-escalation", pattern: /\bgrant (me |myself |us )?(full )?(admin|administrator|root|superuser)\b/i },
    { kind: "control-chars", pattern: /[‪-‮⁦-⁩​-‏]|\\u20(2[a-e]|6[6-9]|0[b-f])/i },
  ],
};

/** Hardened posture for hostile surfaces and agent-to-agent text. */
export const ADVERSARIAL_TIGHT_PACK: PolicyPack = {
  name: "adversarial-tight",
  version: 1,
  injection: [
    { kind: "agent-directed", pattern: /\b(note|message|instruction)s? (to|for) (automated|ai|llm|autonomous)\b/i },
    { kind: "audit-evasion", pattern: /\b(do not|don't|never) (log|record|audit|report)\b/i },
    { kind: "approval-bypass", pattern: /\b(skip|bypass|without|ignore)\b[^.\n]{0,20}\b(approval|review|sign-?off)s?\b/i },
    { kind: "tool-ref", pattern: /\buse\s+[a-z]+_[a-z_]+\b(?=[^.\n]{0,40}\b(grant|admin|delete|drop|export)\b)/i },
  ],
};

/** Ad Spend Autopilot: what the agent may do on its own, and what needs a human. */
export const AUTOPILOT_PACK: PolicyPack = {
  name: "autopilot",
  version: 1,
  injection: [{ kind: "budget-takeover", pattern: /\b(entire|whole|all (of )?the) (account )?budget\b/i }],
  limits: {
    "budget.shift": { amount_usd: { autoMax: 1000, hardMax: 20000 }, share_of_source: { autoMax: 0.5, hardMax: 1 } },
    "budget.increase": { amount_usd: { autoMax: 500, hardMax: 10000 } },
    "budget.decrease": { amount_usd: { autoMax: 1000, hardMax: 20000 } },
  },
  requireApproval: ["campaign.pause"],
};

export const PACKS: Record<string, PolicyPack> = {
  default: DEFAULT_PACK,
  "adversarial-tight": ADVERSARIAL_TIGHT_PACK,
  autopilot: AUTOPILOT_PACK,
};
