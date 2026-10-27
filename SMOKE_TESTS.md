# Smoke tests

Run these after every change.

## Automated

```powershell
npm test                 # 6 offline tests (no stack needed)
npm run typecheck
npm --prefix web run lint
npm run web:build
npm run conformance      # revert conformance/results/* afterwards if only timestamps changed

# with the server running (npm run web:build && npm run serve):
npm run smoke            # HTTP smoke tests
```

`npm run smoke` options:

- `SMOKE_CYCLE=1` also runs a cycle (needs Zetaris). On a fresh ledger it expects executed / held / blocked.
- `SMOKE_REVIEW=1` also rejects the held decision. Reviews are permanent ledger entries.
- `AUTOPILOT_URL` changes the server (default http://127.0.0.1:4180).

Without Zetaris and without a saved cycle, the replay and tamper tests skip.

## Manual (browser)

Open http://127.0.0.1:4180 and check the browser console after each flow (expected: no errors). The app follows the OS light or dark setting.

| # | Flow | Steps | Expected result | Needs |
|---|---|---|---|---|
| 1 | Sections | Click Today, Decisions, Ledger, Replays; refresh on `/ledger` | Each section opens at its own URL; refresh keeps the section; the page title changes | built web UI |
| 2 | Run a cycle | Untick "Explain each decision with Nemotron", click **Run a cycle** | Status goes Queued, Running, then Waiting for you; the six stages tick off with counts and an elapsed time; 3 slips: EXECUTED $500 (0.89), HELD $5,000 (0.46), BLOCKED $6,800; the $500 move animates between the budget bars; ledger shows 5 entries, verified | Zetaris |
| 3 | Failed run | Stop Zetaris, click **Run a cycle** | Status Failed with the reason; button says **Run again**; the previous cycle stays; no new ledger entries | — |
| 4 | Run with Nemotron | Tick the box, run | Same decisions; explanations written by Nemotron (not "Template explanation") | Zetaris + Nightshift |
| 5 | Why I did this | Click it on a slip, or open `?open=D-0003` | Drawer with breadcrumb "Decisions / D-0003", rationale, policy reasons, confidence, evidence SQL and rows; Escape closes and focus returns to the slip | a cycle |
| 6 | Approve / reject | On the HELD slip type a note, click **Reject** (or **Approve**) | Toast; slip status changes; the Decisions tab badge drops; ledger gains entries; a later cycle shows lower confidence for the same move after a rejection | a cycle |
| 7 | Decisions | Open Decisions, use the status filter, open a row | All cycles listed newest first; filter counts match; the drawer opens | a cycle |
| 8 | Ledger | Open Ledger, expand an entry, click **Edit a copy and verify it** | Hash, previous hash, key and signature shown; the copy fails verification at the edited entry; the real ledger stays valid | a cycle |
| 9 | Recorded cycle | Click **Watch recorded cycle** (or open Replays and choose one) | Replays at 8x with its real timing, labelled as recorded; no Approve or Reject; **Back to live** returns | a saved cycle |
| 10 | Search | Press Ctrl+K, type "ledg", Enter | Opens Ledger; Escape closes; decisions and actions are searchable | — |
| 11 | Demo reset | `npm run demo:reset`, reload, run a cycle | Ledger starts empty; the cycle shows executed, held and blocked again; the old ledger is in `.autopilot-archive/` | — |
| 12 | Phone | Resize to 375 px | Tabs scroll sideways; stamps sit above slip titles; no horizontal page scroll | — |
| 13 | Reduced motion | Enable reduce motion in the OS, reload | Nothing slides, scales or glides: screens, lists and dialogs appear with simple fades or at once; the hero is a poster; everything works | — |
| 14 | CLI | `npm run decisions`, `npm run replay -- D-0001`, `npm run verify`, `npm run tamper-demo` | Lists decisions; replay matches; ledger OK; tamper detected | a cycle |
| 15 | Landing page | Open `/` at 1440 px and at 375 px; scroll slowly to the end, then back up | Smooth scrolling; the masthead hides going down and returns going up, with a rule and slight background once scrolled; the headline and **Open the app** show at once and the 3D object fades in over its poster; the object follows the pointer; the hero object assembles block by block as you scroll; sections fade in and rise once; the statement lights up word by word; the pinned story advances through four steps with the matching text beside it; **Open the app** goes to `/app` without a page load; **Theme** in the footer switches Auto, Light and Dark. With reduce motion on: no smooth scroll, a still poster, no reveals, and the story is a plain list | — |

Flows 2–9 and 14 need at least one cycle, and a cycle needs Zetaris.

## Screens to compare (before/after)

Today (empty and after a cycle), Decisions, Ledger, Replays, the decision drawer (`?open=D-0003`), each at 1440 px and 375 px in light and dark.
