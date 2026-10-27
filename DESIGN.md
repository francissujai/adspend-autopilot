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

- **Font.** Satoshi (Fontshare, free for commercial use) for everything, self-hosted as two variable files (upright and italic, weights 300 to 900) with `font-display: swap`. A local fallback (Arial) is sized to Satoshi's metrics, so text does not move when the font arrives. SQL, hashes and state dumps use the system monospace. No font is loaded from a CDN.
- **Type.** Large, medium weight, tight tracking. Marketing: display up to 96px at weight 500 and -0.04em, titles up to 60px, lead 22px, body 17px; at most one italic word per page, in the headline. App: body 16/1.5, labels 14/500, page titles 30/600, figures 26 to 36, tabular numbers in tables, timers and figures. Every size is a token.
- **Colour.** Gray ramp `#000`, `#06080C`, `#111`, `#1F1F1F`, `#282828`, `#595959`, `#969696`, `#A3A3A3`, `#D9D9D9`, `#F2F2F2`; paper `#F2EDE6`. Dark is the base (black page, `#A3A3A3` secondary text); light uses the paper page, white surfaces and ink text. **Auto** follows the OS; **Light** and **Dark** override it (`data-theme` on `<html>`). The accent is used only for focus rings, links, the current page and status.
- **Buttons.** Three styles. Primary: solid ink on light, solid white on dark. Secondary: transparent with a 1px border in the text colour. Tertiary: a text link, underlined on hover. 6px radius; 40px high in the app, 48px on the landing page; 15px/500 sentence-case label. Hover changes colour only (150 ms), active is a shade darker, disabled is 40% opacity, focus is a 2px accent ring with a 2px offset. One primary per screen. Actions that cancel, deny or reject use the same shapes in the danger colour (`danger` on `Button`).
- **Top bar.** Full width, attached to the top, solid page colour, no blur or shadow. On the landing page it is a plain masthead, 64px, ruled once you scroll: the serif wordmark, a thin rule, a few words on what the product is, and one text link, **Open the app →**. In the app it is 56px and always ruled: serif wordmark, up to five text links (14px/500, the current one underlined), and on phones a plain **Menu** button that opens a full-screen sheet of links.
- **Space and shape.** 4px spacing steps, 1280px container, 120px section rhythm (72px on phones). 6px buttons and small cards, 12px panels; 1px lines instead of shadows. No gradients, glows, blur, particles or floating shapes.
- **Breakpoints.** 375 (base), 768, 1009, 1440.
- **Motion.** Framer Motion (`motion/react`) drives everything: scroll-linked motion values (`useScroll`, `useSpring`, `useTransform`, `useVelocity`) on the landing page, and layout animation (`layout`, `layoutId`, `AnimatePresence`) in the app. Lenis smooths landing-page scrolling only, on Motion's frame loop. React Three Fiber and hand-written GLSL draw the WebGL layer. Tokens live in `web/src/motion/tokens.ts` and `foundation.css`: 150 / 250 / 400 / 700 ms; `[0.22, 1, 0.36, 1]` for entrances, `[0.4, 0, 0.2, 1]` for interface changes; spring stiffness 300, damping 30. Only transform and opacity animate. One `LazyMotion` loads `domMax` after first paint (layout animation needs it). Reduced motion: Lenis off, the WebGL layer replaced by the poster, reveals become fades, layout moves are instant, the film becomes a list of stills.
- **In the app.** Native scroll. A screen fades in and slides up 8px over 250 ms when you change sections. The current-page marker in the top bar, the sidebar and segmented controls is one element that glides between items (`layoutId`). Lists animate when items are added, removed or reordered. Dialogs, the drawer and the command palette open with a spring over a fading backdrop and give focus back to what opened them. Streamed steps slide in; status dots pulse only while something is running. Buttons give a 0.98 spring on press; hover changes colour only.

### Landing page (`/`)

The app is at `/app`. The page is one continuous space. A full-window WebGL layer sits behind every section: a field of points at two depths that travels as you scroll and follows the pointer, and the hero object, which is pinned to its slot in the layout, so it scrolls away with the page instead of living in a box.

Top to bottom: a masthead that hides on the way down and returns on the way up; the hero; three facts; five numbered capabilities, each scrubbed by scroll (the number shrinks into place from 2.6x while the title and text slide in); one statement whose words light up as it passes; the **scroll film**; a closing line; the footer (which holds the theme switch). Headings lean a few degrees with scroll speed (skewY from the page's scroll velocity) and settle when you stop. A 2px progress line runs across the top.

- **Scroll film.** The section is tall and its inner block sticks. Scroll progress is spring-smoothed and every element is a transform of it: chapter titles rise out of a mask, rings behind the scene rotate and grow, the scene tilts in perspective, and the product scene is drawn from the progress value. Four chapters per product. With reduced motion each chapter is shown once, as a still.
- **Hero object.** A dark body with a soft rim light in the accent colour, a 30-second idle turn, pointer parallax and a change driven by how far the hero has scrolled. DPR is capped at 2 and drawing stops while the tab is hidden. A still SVG poster fills the slot first and is what you get with reduced motion, on low-power devices (2 cores or fewer, 2 GB memory or less, save-data) and without WebGL.
- **Copy rules.** Each headline says what the product does; facts and figures come from the product and its demo data; no testimonials, logos, invented metrics or hype words. Scenes carry no explanatory paragraphs.

### Ad Spend Autopilot

- **Accent.** Green `#0B7A55`; `#5FD39A` as text and rim light on dark, `#086846` on paper.
- **Hero object.** One block per signed ledger entry, linked in a ring. The blocks start scattered and assemble as the page scrolls; each lights up when it is "signed", and a pulse walks the chain. The ledger's real length sets how many are signed on load.
- **Film.** One decision (D-0002, a $5,000 shift). Read: nine ad lines stream in under a scan line. Check: the platform's 5.58x bar grows, then collapses to the 0.97x your orders show. Decide: small moves pass a policy gate; the $5,000 block stops in front of it and is stamped Held. Sign: a new block drops onto the chain while its hash is computed character by character, a link draws and a check mark signs it.
