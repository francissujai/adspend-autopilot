// The decision ledger: an append-only JSONL file where every entry is
//   hash      = SHA-256(canonical JSON of {seq, type, at, payload, prevHash})
//   signature = Ed25519(hash) with the autopilot's key
// Entries chain through prevHash, so editing, deleting or reordering any
// entry breaks verification from that point on. The public key is written
// next to the ledger so anyone can verify it without the private key.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "../engines/scout/index.ts";

export type EntryType = "cycle" | "decision" | "approval" | "execution" | "memory";

export interface LedgerEntry<T = unknown> {
  seq: number;
  type: EntryType;
  at: string;
  payload: T;
  prevHash: string;
  hash: string;
  signature: string; // base64 Ed25519 over the hash bytes
  keyId: string; // first 16 hex of SHA-256(public key DER)
}

const GENESIS = "0".repeat(64);

export function loadOrCreateKeys(dir: string): { privateKey: KeyObject; publicKey: KeyObject; keyId: string } {
  fs.mkdirSync(dir, { recursive: true });
  const priv = path.join(dir, "ledger-ed25519.pem");
  const pub = path.join(dir, "ledger-ed25519.pub.pem");
  if (!fs.existsSync(priv)) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    fs.writeFileSync(priv, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    fs.writeFileSync(pub, publicKey.export({ type: "spki", format: "pem" }));
  }
  const privateKey = createPrivateKey(fs.readFileSync(priv));
  const publicKey = createPublicKey(fs.readFileSync(pub));
  return { privateKey, publicKey, keyId: keyIdOf(publicKey) };
}

export const keyIdOf = (k: KeyObject) => createHash("sha256").update(k.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
const hashOf = (e: Pick<LedgerEntry, "seq" | "type" | "at" | "payload" | "prevHash">) => createHash("sha256").update(canonicalJson({ seq: e.seq, type: e.type, at: e.at, payload: e.payload, prevHash: e.prevHash })).digest("hex");

export class Ledger {
  readonly file: string;
  private keys: ReturnType<typeof loadOrCreateKeys>;
  private entries: LedgerEntry[] = [];

  constructor(dir: string, keyDir = dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "ledger.jsonl");
    this.keys = loadOrCreateKeys(keyDir);
    fs.writeFileSync(path.join(dir, "ledger-public-key.pem"), this.keys.publicKey.export({ type: "spki", format: "pem" }));
    if (fs.existsSync(this.file)) this.entries = fs.readFileSync(this.file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LedgerEntry);
  }

  all(): LedgerEntry[] {
    return [...this.entries];
  }

  append<T>(type: EntryType, payload: T, at = new Date().toISOString()): LedgerEntry<T> {
    const prev = this.entries.at(-1);
    const base = { seq: (prev?.seq ?? 0) + 1, type, at, payload, prevHash: prev?.hash ?? GENESIS };
    const hash = hashOf(base);
    const signature = edSign(null, Buffer.from(hash, "hex"), this.keys.privateKey).toString("base64");
    const entry: LedgerEntry<T> = { ...base, hash, signature, keyId: this.keys.keyId };
    fs.appendFileSync(this.file, JSON.stringify(entry) + "\n");
    this.entries.push(entry);
    return entry;
  }
}

export interface VerifyReport {
  ok: boolean;
  entries: number;
  firstBad?: { seq: number; reason: string };
}

/** Verifies the hash chain and every signature with only the public key. */
export function verifyLedger(entries: LedgerEntry[], publicKey: KeyObject): VerifyReport {
  let prevHash = GENESIS;
  const keyId = keyIdOf(publicKey);
  for (const [i, e] of entries.entries()) {
    const fail = (reason: string): VerifyReport => ({ ok: false, entries: entries.length, firstBad: { seq: e.seq, reason } });
    if (e.seq !== i + 1) return fail(`sequence gap: expected ${i + 1}`);
    if (e.prevHash !== prevHash) return fail("prevHash does not match the previous entry (entry removed, inserted or reordered)");
    if (hashOf(e) !== e.hash) return fail("content does not match its hash (entry edited)");
    if (e.keyId !== keyId) return fail(`signed by unknown key ${e.keyId}`);
    if (!edVerify(null, Buffer.from(e.hash, "hex"), publicKey, Buffer.from(e.signature, "base64"))) return fail("bad signature");
    prevHash = e.hash;
  }
  return { ok: true, entries: entries.length };
}
