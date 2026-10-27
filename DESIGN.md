# Ad Spend Autopilot design brief

## Product
**Who:** a performance marketer who lets an agent move daily ad budget and needs to trust and audit it.
**Job:** see what the autopilot moved, why, on whose evidence, and approve or reject the risky moves.
**One line:** budget moves you can audit.

### Routes and flows (unchanged)
| Route | Purpose |
|---|---|
| `/` | Today: run a cycle, see the budget board and this cycle's decisions |
| `/decisions` | Every decision across cycles, filtered by status |
| `/ledger` | The signed hash chain, verification and the tamper demo |
| `/replays` | Recorded cycles that replay with their real timing |
| `?open=D-0002`, `?replay=<cycle>&speed=8` | Existing deep links, still work |

The server already returns the app for unknown paths, so these sections need no backend change.

### Where a new user gets lost, and the fix
- Before: one long page where run controls, decisions, trace and ledger compete; a first visit shows empty boxes. Now each job has its own section and an empty first run offers "Watch a recorded cycle" as the first step.
- Clicks to first value: 1 (recorded cycle) or 1 (Run a cycle, with Zetaris).

## Design system

The foundation is defined once in `web/src/foundation.css`; buttons, the top bar and the phone menu are in `web/src/ui/controls.css` and `web/src/ui/Button.tsx`. Components use the names in the app stylesheet, and each of those points at a foundation token, so no component holds a raw colour, font size, family or duration.

- **Fonts.** Instrument Serif (weight 400) for marketing headlines, the top-bar wordmark and the phone menu; Instrument Sans for everything else, and the only face on app screens. Both are self-hosted from `@fontsource` with `font-display: swap`, and each has a local fallback (Arial, Times New Roman) sized to its metrics so text does not move when the font arrives. SQL, hashes and state dumps use the system monospace.
- **Type.** Marketing: display 76/1.02 at -0.015em (60 and 46 on smaller screens), titles 38/1.1, body 16/1.5; at most one italic word per page, in the headline. App: body 15/1.5, labels 13/500, page titles 24/600, tabular numbers in tables, timers and figures.
- **Colour.** Gray ramp `#000`, `#06080C`, `#111`, `#1F1F1F`, `#282828`, `#595959`, `#969696`, `#A3A3A3`, `#D9D9D9`, `#F2F2F2`; paper `#F2EDE6`. Dark is the base (black page, `#A3A3A3` secondary text); light uses the paper page, white surfaces and ink text. **Auto** follows the OS; **Light** and **Dark** override it (`data-theme` on `<html>`). The accent is used only for focus rings, links, the current page and status.
- **Buttons.** Three styles. Primary: solid ink on light, solid white on dark. Secondary: transparent with a 1px border in the text colour. Tertiary: a text link, underlined on hover. 6px radius; 40px high in the app, 48px on the landing page; 15px/500 sentence-case label. Hover changes colour only (150 ms), active is a shade darker, disabled is 40% opacity, focus is a 2px accent ring with a 2px offset. One primary per screen. Actions that cancel, deny or reject use the same shapes in the danger colour (`danger` on `Button`).
- **Top bar.** Full width, attached to the top, solid page colour, no blur or shadow. On the landing page it is a plain masthead, 64px, ruled once you scroll: the serif wordmark, a thin rule, a few words on what the product is, and one text link, **Open the app →**. In the app it is 56px and always ruled: serif wordmark, up to five text links (14px/500, the current one underlined), and on phones a plain **Menu** button that opens a full-screen sheet of links.
- **Space and shape.** 4px spacing steps, 1280px container, 120px section rhythm (72px on phones). 6px buttons and small cards, 12px panels; 1px lines instead of shadows. No gradients, glows, blur, particles or floating shapes.
- **Breakpoints.** 375 (base), 768, 1009, 1440.
- **Motion.** Fades and layout moves that show a change of state, 150 to 250 ms, ease-out (`--ds-ease-out`). Reduced motion turns all of it off.

### Landing page (`/`)

The app is at `/app`. The landing page reads top to bottom: top bar, hero, three facts, five numbered capabilities, one statement of why the product exists, three product views you can switch between, a closing line and the footer (which holds the theme switch). It has no canvas, no scroll effects and no smooth-scrolling library.

- **Copy rules.** Each headline says what the product does; facts and figures come from the product and its demo data; no testimonials, logos, invented metrics or hype words.

### Ad Spend Autopilot

- **Accent.** Green `#0B7A55`; `#5FD39A` as text on dark, `#086846` on paper.
- **Hero.** A framed view of one real decision (D-0002, a $5,000 shift) moving through its states: read through Zetaris, checked against backend revenue, held by policy, signed into the ledger. It steps every 1.4 seconds and shows the finished record when reduced motion is on. The window header shows the live ledger size.
