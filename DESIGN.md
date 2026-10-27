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
- **Motion.** Libraries: Motion (`motion/react`) for interface and scroll animation, Lenis for smooth scroll on the landing page only, React Three Fiber with hand-written GLSL for the hero object. All durations, curves and springs are tokens in `web/src/motion/tokens.ts` (CSS twins `--ds-dur-*` and `--ds-ease-*`): 150 / 250 / 400 / 700 ms; `[0.22, 1, 0.36, 1]` for entrances, `[0.4, 0, 0.2, 1]` for interface changes; spring stiffness 300, damping 30 for things you touch. Only transform and opacity animate. One `LazyMotion` loads the features after first paint (`domMax`, because layout and `layoutId` animation need it). Reduced motion: Lenis is off, the hero is a still poster, reveals are plain fades, layout moves are instant, the pinned story becomes a list.
- **In the app.** Native scroll. A screen fades in and slides up 8px over 250 ms when you change sections. The current-page marker in the top bar, the sidebar and segmented controls is one element that glides between items (`layoutId`). Lists animate when items are added, removed or reordered (`layout` with `AnimatePresence`). Dialogs, the drawer and the command palette open with a spring over a fading backdrop and give focus back to what opened them. Streamed steps slide in; status dots pulse only while something is running. Buttons give a 0.98 spring on press; hover changes colour only.

### Landing page (`/`)

The app is at `/app`. Top to bottom: a masthead that hides on the way down and returns on the way up (gaining a rule and a slight background once the page scrolls), the hero (headline, one sentence, one button, the 3D object), three facts, five numbered capabilities, one statement whose words light up as it scrolls through, a pinned story, a closing line and the footer (which holds the theme switch). Smooth scrolling (Lenis) runs on this page only and is driven by Motion's frame loop; app screens keep native scroll.

- **Reveals.** Sections fade in and rise 24px once, over 700 ms; the framed preview scales from 0.96 to 1 as it enters; the statement goes word by word from 15% to full opacity.
- **Pinned story.** The section is tall and its inner block sticks while the page scrolls through it. A product view changes state with each of four steps while the matching text fades in beside it. With reduced motion the steps and views are laid out one after another.
- **Hero object.** A WebGL scene in its own chunk (three.js, React Three Fiber, custom shaders), loaded after first paint. A dark body with a soft rim light in the accent colour; a 30-second idle turn, pointer parallax, and one change driven by how far the hero has scrolled. DPR is capped at 2; drawing stops when the hero is off screen or the tab is hidden. A static poster (SVG) is always rendered first and is what you get with reduced motion, on low-power devices (2 cores or fewer, 2 GB memory or less, save-data) and without WebGL.
- **Copy rules.** Each headline says what the product does; facts and figures come from the product and its demo data; no testimonials, logos, invented metrics or hype words.

### Ad Spend Autopilot

- **Accent.** Green `#0B7A55`; `#5FD39A` as text on dark and as the rim light, `#086846` on paper.
- **Hero object.** One block per signed ledger entry, linked in a ring. The blocks start scattered and assemble as the page scrolls; each lights up when it is "signed", and a pulse walks the chain the way a signature does. The ledger's real length sets how many blocks are signed on load.
- **Pinned story.** One decision (D-0002, a $5,000 shift) in four steps: read, checked against real revenue, held by policy, signed.
