# Ad Spend Autopilot audit

Audit of `jason/polish` at tag `baseline-before-polish`. Scoring weights used for ranking: Impact 30, Technical 20,
Innovation 15, Demo 15, Product & UX 10, Sponsor tech 10. Deadline Oct 27, 23:45 UTC.

Tested here: the full cycle (model off) against the real seed data, through a local stand-in for the Zetaris SQL
endpoint. The cycle reproduced the README exactly ($500 executed at 0.89, $5,000 held at 0.46, $6,800 blocked).
Also tested: Why drawer, reject, replay, tamper demo, 6 unit tests, smoke tests, conformance.
Not tested here: model-written rationales (no Nightshift on this machine yet).

Overall: the strongest of the three codebases. Clear architecture (the model explains, deterministic policy
decides), good tests, a deliberate visual identity, reduced-motion handled in every GSAP animation, an accessible
drawer (Escape, focus, `role="dialog"`).

## 1. Bugs and broken flows

| # | Severity | What fails | Where | Fix |
|---|---|---|---|---|
| B1 | High | **Zetaris down shows a false trust badge.** Every query fails with `fetch failed`; the governance probe's catch treats any error as "denied", so the header shows the green "Agent can't read customer data, enforced by Zetaris" | `src/autopilot/data.ts` governance probe (`catch (err) { governance = { allowed: false, detail: "denied by Zetaris: …" } }`) | Only count it as denied when the error is a Zetaris privilege error (message contains "privileges"); otherwise record `unknown` and show a grey "Could not reach Zetaris" badge |
| B2 | High (demo) | **A cycle with Zetaris down blanks the dashboard.** It finishes with 0 decisions and no error, and is signed into the ledger as the latest cycle, so the previous good decisions disappear from the main view | `src/autopilot/autopilot.ts:100-151` (`runCycle`); `web/src/App.tsx` shows only `state.cycles[0]` | If all evidence queries failed, emit an `error` event and do not write a cycle entry. The UI then shows the error banner (already exists) and keeps the last good cycle |
| B3 | High (demo) | **Rehearsals change the live demo.** A second cycle on the same data skips moves that already executed (by design), so after one rehearsal the live run shows 2 decisions and no "EXECUTED $500" slip. There is no reset other than deleting `.autopilot/` by hand | `src/autopilot/autopilot.ts:118` | Add `npm run demo:reset` that moves `.autopilot/` to `.autopilot-archive/<timestamp>/` (feature F1) |
| B4 | Medium | At 375 px the EXECUTED / HELD / BLOCKED stamps sit on top of the decision titles | `web/src/styles.css:116-120` (`.stamp` absolute), `.slip h3` | Below 600 px, render the stamp inline above the title |
| B5 | Medium | At 375 px the budget bars shrink to slivers; names wrap to 3 lines | `web/src/styles.css:93` (`.lane` 140 px / 1fr / 74 px) | Below 600 px, stack name above a full-width bar |
| B6 | Low | Confidence factor shows "1 $5411 spend in 7 days": raw score with no context and an unformatted amount, unlike the rest of the UI | `src/autopilot/policy.ts:36`, `web/src/components/WhyDrawer.tsx:76` | Show the score as `1.00` and format the note with `money()` |
| B7 | Low | With the model switched off on purpose, the trace still says "Nemotron … explained (template: model unavailable)" | `web/src/components/Trace.tsx:17` | Label it "Template" and say "model off" when the run was started with the model off |
| B8 | Low | Every review is recorded as by "Marketer": the client always sends `localStorage.reviewer` or "Marketer", and nothing in the UI sets it. The server's own default (OS user name) never applies | `web/src/App.tsx` `review()` | Send no `by` when unset so the server default applies, or add a name field |
| B9 | Low | oxlint warnings: ref read during render, setState in an effect | `web/src/components/FlowBoard.tsx:29`, `web/src/App.tsx:36` | First is inside a GSAP callback (false positive); second is harmless. Leave |

## 2. Code quality

- Good: deterministic pipeline, pure `buildSnapshot`, replay compares field by field, tests cover policy, contracts, ledger tampering.
- `new Autopilot()` on every API request re-reads the ledger and keys (`src/server.ts`). Fine at this size.
- Duplicated: `conformance/`, `src/engines/hmem`, `src/engines/markovian` are copied from WhyBot. Expected for separate submissions; not worth changing.
- Hardcoded: `AUTOPILOT_AS_OF` default `2026-10-19` repeated in `data.ts` and `autopilot.ts:106`.
- Missing types: none of note; `strict` is on.

## 3. Security

| # | Severity | Issue | Where | Fix |
|---|---|---|---|---|
| S1 | Medium | B1 above: a trust signal shown to users is wrong when Zetaris is unreachable | `src/autopilot/data.ts` | As B1 |
| S2 | Low | Static file guard checks `file.startsWith(WEB)` without a trailing separator, so `/../dist-x/...` would pass for a sibling folder named `dist…`. No such folder exists, so not exploitable today | `src/server.ts` `serveStatic` | Compare against `WEB + path.sep` |
| S3 | Low | Scout's fallback secret `scout-dev-secret-change-me` exists in code. Not reachable: `Autopilot` always passes a generated secret | `src/engines/scout/scout.ts:59` | None needed |
| — | OK | Binds `127.0.0.1`; no CORS header (same-origin only); body size capped; review input validated; Ed25519 private key and HMAC secret live in gitignored `.autopilot/keys/`; no secrets in git history; `npm audit` clean (root and web) |

## 4. Performance

- Web bundle 314 KB JS (104 KB gzip) plus self-hosted fonts. Fine.
- Fonts ship latin-ext files that the UI never uses (about 60 KB). Not worth changing now.
- A cycle with the model off takes under 1 s. With Nemotron it is three model calls; on cloud lanes that can be minutes (`MODEL_CALL_TIMEOUT_S=600`).

## 5. Demo risk

| Risk | Where | Mitigation |
|---|---|---|
| Zetaris down → green badge that is false, and a blank dashboard | B1, B2 | Fix both (about 1 h together) |
| A rehearsal already executed the $500 move, so the live run has no EXECUTED slip | B3 | `npm run demo:reset` before recording (F1) |
| Fresh machine shows an empty dashboard | `.autopilot/` is gitignored | Replay of a saved cycle (`?replay=`) already exists but is hidden; surface it (F1) |
| Nemotron on a slow cloud lane: the run sits for minutes | `src/llm/meterless.ts` | Record the video with the model on; for live demos tick the model off or use replay |
| Mobile/narrow window: stamps cover titles | B4 | CSS fix |

## 6. UI review (first 60 seconds as a judge)

What a judge sees: a clear one-line promise ("Budget moves you can audit."), one dark primary button, a budget board, three decision slips with rubber stamps, a live trace, a hash-chained ledger. It already has one primary action, a restrained palette with semantic colours, consistent radii, focus rings and reduced-motion support.

The "cheque and ledger" identity is deliberate and fits the audit story. A switch to SF Pro / Inter and Apple-style surfaces would remove that identity, so I recommend keeping the type and palette and fixing the gaps below.

| # | Screen | Now | Change | Why it helps a first-time user |
|---|---|---|---|---|
| U1 | Decision slips, 375 px | Stamps cover the titles | Inline stamp above the title below 600 px (B4) | Readable on a phone |
| U2 | Budget board, 375 px | Bars are slivers | Stacked lanes below 600 px (B5) | Shows the money move clearly |
| U3 | Empty dashboard | Two empty boxes and "No cycles yet" | Empty state with two actions: "Run a cycle" and "Watch the recorded cycle" (replay) | A judge sees value in one click even if Zetaris is not running |
| U4 | Header seals | Green "Ledger verified (0 entries)" on an empty ledger | Neutral "Ledger empty" until the first entry | A green check should mean something was checked |
| U5 | Run area | Button text changes to "Running a cycle"; progress is in the sidebar trace, below the fold on narrow screens | Short stage line under the button: "Reading Zetaris → Scout checks → Signing" driven by the existing events | Progress visible where the user clicked |
| U6 | Why drawer | Confidence factors as raw numbers ("1", "$5411") | `1.00 of 1`, `$5,411` (B6) | Consistent with the rest of the page |
| U7 | Trace | "Nemotron … (template: model unavailable)" when the model was switched off | "Template … (model off)" (B7) | Accurate wording |
| U8 | Dark mode | None | Skip: the paper-and-ink identity depends on the light ground | — |
| U9 | Accessibility | Focus rings, labels, dialog all good. Two contrast failures: `--ink-faint` `#7d8aa1` (run meta, legend, byline, trace labels) is 3.41:1 on cards and 3.06:1 on the page; held amber `#b7770f` is 3.63:1 before the stamp's 0.88 opacity | `--ink-faint` → `#5f6b82` and held text → `#9a6200` (4.99:1) | WCAG AA (4.5:1 for small text) |

### Top 5 UI changes (wow ÷ effort)

| Rank | Change | Effort | Break risk | Touches |
|---|---|---|---|---|
| 1 | U3 empty state with "Watch the recorded cycle" | 1 h | Low | `App.tsx` empty states; uses the existing replay mode |
| 2 | U1 + U2 mobile slips and board | 1 h | Low | `styles.css` only |
| 3 | U6 + U7 wording and number formatting | 0.5 h | Low | `WhyDrawer.tsx`, `Trace.tsx` |
| 4 | U5 stage line under Run | 1 h | Low | `App.tsx` (reads events it already receives) |
| 5 | U4 + U9 neutral empty seal, held-colour contrast | 0.25 h | Low | `App.tsx`, `styles.css` |

## 7. Features (max 5)

| # | Feature | User problem | Why judges notice | Effort | Break risk | Depends on |
|---|---|---|---|---|---|---|
| **F1 (top pick)** | **Demo-safe mode**: `npm run demo:reset` (archives `.autopilot/`), plus a "Watch the recorded cycle" button that plays the most recent saved cycle with its real timing | Rehearsals change the live result (B3); a fresh machine shows nothing; Zetaris or Nightshift can fail on stage | The demo always shows the three outcomes; replay is real recorded data, labelled as such | S (2 h) | Low: uses the existing replay endpoint; new CLI command | A saved cycle on the demo machine |
| F2 | **Trust memory made visible**: after a rejection, the next cycle's slip shows "Confidence 0.46 → 0.25: you rejected this on Oct 26 (H-MEM)" | The H-MEM effect is the most interesting behaviour but is only visible in the drawer | Shows Meterless H-MEM doing real work: Sponsor tech and Innovation | S–M (2–3 h) | Low: data already in `d.trust` | — |
| F3 | **Audit packet export**: download one decision as JSON with evidence rows, signatures and the public key, plus a one-line verify command | Auditors need to check decisions outside the app | "Decisions you can audit", made concrete | S (1–2 h) | Low: new GET endpoint | — |
| F4 | **Stack health on the page**: Zetaris reachable, agent identity, Nightshift reachable, with fixes | B1/B2 happen silently today | Prevents demo surprises; looks production-ready | S (1–2 h) | Low | B1 fix |
| F5 | **Reviewer name**: small "Signed as" field stored locally and shown on reviews | Every review says "Marketer" (B8) | Small, but the ledger reads correctly | S (0.5 h) | Low | — |

## 8. Suggested build order before the deadline

B1 + B2 (correctness, 1 h) → F1 (2 h) → UI top 1–3 (2.5 h) → F2 (2–3 h) → rest if time remains.
