/**
 * @file src/styles/panels/marketingPages.ts
 *
 * CSS for Landing Page, Resources, and Solutions marketing pages.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 *
 * PRYZM4 (Master-Foundation adaptation):
 *   The landing page now uses an animated CSS @property mesh-gradient background
 *   derived from the Master-Foundation MIAW design system. Four colour blobs
 *   drift across the viewport via @keyframes, creating a living violet-lavender
 *   ambient field. The hero is full-screen centred (no white card overlay) with:
 *     • PRYZM pyramid icon + wordmark  → large bold heading
 *     • "Build the future, intelligently."
 *     • Pill CTAs + feature-tag strip
 *   The project hub receives the same gradient at lower saturation (see
 *   projectHub.ts ph-shell). The boot skeleton in index.html mirrors this
 *   layout so first-paint is visually seamless before the JS bundle resolves.
 *
 *   @property blob positions: --lp4-b{1-4}{x,y}
 *   @property blob colours  : --lp4-c{1-4}
 *   Animation               : lp4-mesh-flow 45 s ease-in-out infinite
 *   Reduced-motion guard    : pauses animation per WCAG 2.1 SC 2.3.3
 */

export const LANDING_PAGE_STYLES = `
    /* ─── PRYZM4 CSS @property — mesh gradient blob positions ─────────
       syntax:'<percentage>' lets the browser interpolate these numerically
       inside @keyframes. inherits:false is required for per-element
       transitions. Chrome 85+, Firefox 128+, Safari 16.4+.
    ─────────────────────────────────────────────────────────────────── */
    @property --lp4-b1x { syntax: '<percentage>'; initial-value: 5%;  inherits: false; }
    @property --lp4-b1y { syntax: '<percentage>'; initial-value: 55%; inherits: false; }
    @property --lp4-b2x { syntax: '<percentage>'; initial-value: 92%; inherits: false; }
    @property --lp4-b2y { syntax: '<percentage>'; initial-value: 18%; inherits: false; }
    @property --lp4-b3x { syntax: '<percentage>'; initial-value: 72%; inherits: false; }
    @property --lp4-b3y { syntax: '<percentage>'; initial-value: 90%; inherits: false; }
    @property --lp4-b4x { syntax: '<percentage>'; initial-value: 40%; inherits: false; }
    @property --lp4-b4y { syntax: '<percentage>'; initial-value: 5%;  inherits: false; }

    /* ─── PRYZM4 CSS @property — mesh gradient blob colours ───────────
       Palette: original 4 soft lavenders + 2 new deeper violet/indigo
       blobs (pastel-tinted from user refs: ~#8B4FCC medium-violet and
       ~#6600FF electric-indigo). The extra blobs add ~20% more colour
       presence while staying well within the light pastel range.
         --lp4-c1  left blob    #c8b6ff  pastel purple-violet
         --lp4-c2  right blob   #b8a2ff  richer pastel purple (brand purple lightened)
         --lp4-c3  base blob    #daceff  soft purple
         --lp4-c4  top blob     #ece7ff  near-white with purple cast
         --lp4-c5  accent blob  #b89dfa  medium violet-indigo (ref image 1 pastelised)
         --lp4-c6  accent blob  #c49bfb  violet-magenta (ref image 2 pastelised)
    ─────────────────────────────────────────────────────────────────── */
    @property --lp4-c1 { syntax: '<color>'; initial-value: #c8b6ff; inherits: false; }
    @property --lp4-c2 { syntax: '<color>'; initial-value: #b8a2ff; inherits: false; }
    @property --lp4-c3 { syntax: '<color>'; initial-value: #daceff; inherits: false; }
    @property --lp4-c4 { syntax: '<color>'; initial-value: #ece7ff; inherits: false; }
    @property --lp4-c5 { syntax: '<color>'; initial-value: #b89dfa; inherits: false; }
    @property --lp4-c6 { syntax: '<color>'; initial-value: #c49bfb; inherits: false; }

    /* ─── PRYZM4 CSS @property — extra blob positions (b5, b6) ─────── */
    @property --lp4-b5x { syntax: '<percentage>'; initial-value: 25%; inherits: false; }
    @property --lp4-b5y { syntax: '<percentage>'; initial-value: 30%; inherits: false; }
    @property --lp4-b6x { syntax: '<percentage>'; initial-value: 78%; inherits: false; }
    @property --lp4-b6y { syntax: '<percentage>'; initial-value: 65%; inherits: false; }

    /* ─── PRYZM4 mesh-flow keyframes — extended to 6 blobs ──────────── */
    @keyframes lp4-mesh-flow {
        0%   { --lp4-b1x:  5%; --lp4-b1y: 55%; --lp4-b2x: 92%; --lp4-b2y: 18%; --lp4-b3x: 72%; --lp4-b3y: 90%; --lp4-b4x: 40%; --lp4-b4y:  5%; --lp4-b5x: 25%; --lp4-b5y: 30%; --lp4-b6x: 78%; --lp4-b6y: 65%; }
        12%  { --lp4-b1x: 45%; --lp4-b1y: 22%; --lp4-b2x: 60%; --lp4-b2y: 72%; --lp4-b3x: 88%; --lp4-b3y: 35%; --lp4-b4x: 12%; --lp4-b4y: 58%; --lp4-b5x: 70%; --lp4-b5y: 15%; --lp4-b6x: 18%; --lp4-b6y: 82%; }
        25%  { --lp4-b1x: 12%; --lp4-b1y: 82%; --lp4-b2x: 85%; --lp4-b2y:  8%; --lp4-b3x: 30%; --lp4-b3y: 92%; --lp4-b4x: 78%; --lp4-b4y: 20%; --lp4-b5x: 55%; --lp4-b5y: 68%; --lp4-b6x: 42%; --lp4-b6y: 12%; }
        37%  { --lp4-b1x: 68%; --lp4-b1y: 45%; --lp4-b2x: 22%; --lp4-b2y: 60%; --lp4-b3x: 82%; --lp4-b3y: 18%; --lp4-b4x: 50%; --lp4-b4y: 88%; --lp4-b5x: 10%; --lp4-b5y: 50%; --lp4-b6x: 88%; --lp4-b6y: 30%; }
        50%  { --lp4-b1x:  8%; --lp4-b1y: 18%; --lp4-b2x: 90%; --lp4-b2y: 82%; --lp4-b3x: 48%; --lp4-b3y: 55%; --lp4-b4x: 20%; --lp4-b4y: 35%; --lp4-b5x: 80%; --lp4-b5y: 40%; --lp4-b6x: 35%; --lp4-b6y: 75%; }
        62%  { --lp4-b1x: 72%; --lp4-b1y: 78%; --lp4-b2x: 35%; --lp4-b2y: 12%; --lp4-b3x: 15%; --lp4-b3y: 70%; --lp4-b4x: 88%; --lp4-b4y: 42%; --lp4-b5x: 45%; --lp4-b5y: 88%; --lp4-b6x: 60%; --lp4-b6y: 22%; }
        75%  { --lp4-b1x: 28%; --lp4-b1y: 38%; --lp4-b2x: 78%; --lp4-b2y: 55%; --lp4-b3x: 62%; --lp4-b3y: 28%; --lp4-b4x: 35%; --lp4-b4y: 75%; --lp4-b5x: 92%; --lp4-b5y: 60%; --lp4-b6x: 12%; --lp4-b6y: 42%; }
        87%  { --lp4-b1x: 55%; --lp4-b1y: 88%; --lp4-b2x: 15%; --lp4-b2y: 35%; --lp4-b3x: 92%; --lp4-b3y: 72%; --lp4-b4x: 62%; --lp4-b4y: 12%; --lp4-b5x: 30%; --lp4-b5y: 20%; --lp4-b6x: 72%; --lp4-b6y: 85%; }
        100% { --lp4-b1x:  5%; --lp4-b1y: 55%; --lp4-b2x: 92%; --lp4-b2y: 18%; --lp4-b3x: 72%; --lp4-b3y: 90%; --lp4-b4x: 40%; --lp4-b4y:  5%; --lp4-b5x: 25%; --lp4-b5y: 30%; --lp4-b6x: 78%; --lp4-b6y: 65%; }
    }

    /* ─── Shell — PRYZM4 animated gradient background ─────────────────
       Six blobs total: original 4 + 2 smaller accent blobs in deeper
       violet-indigo tones. The accent blobs (b5, b6) use tighter ellipses
       (45–50%) so their contribution is subtle — roughly +20% colour density.
    ─────────────────────────────────────────────────────────────────── */
    .lp-shell {
        position: fixed;
        inset: 0;
        background:
            radial-gradient(ellipse 90% 70% at var(--lp4-b1x) var(--lp4-b1y), var(--lp4-c1) 0%, transparent 65%),
            radial-gradient(ellipse 70% 60% at var(--lp4-b2x) var(--lp4-b2y), var(--lp4-c2) 0%, transparent 58%),
            radial-gradient(ellipse 65% 55% at var(--lp4-b3x) var(--lp4-b3y), var(--lp4-c3) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at var(--lp4-b4x) var(--lp4-b4y), var(--lp4-c4) 0%, transparent 50%),
            radial-gradient(ellipse 35% 29% at var(--lp4-b5x) var(--lp4-b5y), var(--lp4-c5) 0%, transparent 48%),
            radial-gradient(ellipse 32% 27% at var(--lp4-b6x) var(--lp4-b6y), var(--lp4-c6) 0%, transparent 45%),
            #f3f0ff;
        animation: lp4-mesh-flow 65s ease-in-out infinite;
        display: flex;
        flex-direction: column;
        font-family: var(--app-font);
        color: var(--app-text);
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 10;
    }
    @media (prefers-reduced-motion: reduce) {
        .lp-shell { animation: none; }
    }

    /* ─── Navbar — KRETZ-modelled violet bar (founder brief 2026-08-09) ──
       Supersedes the motif.io transparent header of 2026-08-07. The reference
       is a SLIM bar with three bands:
         1. brand   — the wordmark alone, far left. The pyramid glyph is gone
                      from the bar: the reference puts a plain wordmark here,
                      and the PRYZM tile mark now closes the row on the right.
         2. links   — optically CENTRED in the bar. Auto margins cannot centre
                      them (the brand and action bands have very different
                      widths), so the pill is absolutely positioned at 50% and
                      translated back. .lp-nav is position:relative already.
         3. actions — Contact sales → Log in → Get started → Book a demo, then
                      the TILE MARK, closing the row at the far right.
       Colour: the reference bar is white; the founder's is BRAND VIOLET, so
       #6600FF fills the bar and every control inverts to white-on-violet.
       C51 §2.1.4 / C43 §1.5 tokens only — #6600FF, #4A00B7, #ffffff. The
       primary "Book a demo" pill inverts to SOLID WHITE with #4A00B7 text
       (16.9:1): a solid-purple pill on a purple bar would vanish, and the
       brand direction is white + purple with NO black.
       Sticky is now safe (it was refused while the bar was transparent over
       the deep-purple plate, which killed the outlined CTAs' contrast); an
       OPAQUE violet bar keeps every control legible over anything it crosses.
    ────────────────────────────────────────────────────────────────── */
    .lp-nav {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 18px;
        min-height: 64px;
        /* position:relative is also what the centred links pill and the mobile
           drawer (top:100%) resolve against — sticky preserves that. */
        position: sticky;
        top: 0;
        z-index: 60;
        /* §NAV-GRADIENT (founder brief 2026-08-10, polished round 2) — a soft
           RADIAL pool of the deeper violet centred behind the logo tile, dissolving
           into the canonical brand violet across the bar.
           WHY RADIAL, NOT A LEFT-TO-RIGHT RAMP: round 1 used
           linear-gradient(to right, #4A00B7, #6600FF). A full-width linear ramp
           spends its entire length inside the narrow band between two
           nearly-identical violets, so 8-bit quantisation makes it read as BANDING
           — and it still left a visible edge where the tile met the bar, the very
           defect it was meant to remove. A radial pool concentrates the dark where
           the tile actually is and then has ~80 pc of the bar to dissolve over,
           which is enough distance for the step to vanish.
           Anchor 42px = the mark centre (18px bar padding + half of the 40px tile
           + its margin), so the pool tracks the MARK, not the viewport edge.
           The outer stop is rgba(102,0,255,0) — the same rgb as the base colour at
           zero alpha. Fading to plain transparent interpolates through
           premultiplied black and greys the middle of the wash.
           #4A00B7 is the canonical pryzm-purple-darker token and #6600FF the
           canonical pryzm-purple; the two intermediate values only shape the
           falloff between those tokens and add no new brand colour.
           White text clears AA across the whole range (the darker end only raises
           contrast), so no C43 §1.5 pair changes meaning.
           No backticks in this comment: the stylesheet is a JS template literal,
           so one would terminate it (esbuild: Expected ; but found to). */
        background-color: #6600FF;
        background-image: radial-gradient(150% 320% at 42px 50%,
            #4A00B7 0%, #4E03C2 22%, #5A11E2 46%, rgba(102,0,255,0) 82%);
        box-shadow: 0 1px 0 rgba(255,255,255,0.16), 0 6px 20px rgba(40,0,110,0.18);
        flex-shrink: 0;
    }
    .lp-nav-brand {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-shrink: 0;
        text-decoration: none;
        cursor: pointer;
        margin-right: auto;
        min-width: 151px;
        color: #ffffff;
    }
    .lp-logo-icon {
        width: 48px;
        height: 48px;
        display: block;
        filter: drop-shadow(0 1px 6px rgba(80,20,180,0.22));
        flex-shrink: 0;
        overflow: visible;
    }
    /* The brand descender under the wordmark was REMOVED 2026-08-10 per founder
       brief — the hero subhead already states what PRYZM is, so repeating it in the
       bar was noise. Rule deleted rather than left dead: an unused selector is a
       trap for the next editor. (The class name is intentionally not written here —
       MarketingPages.test.ts asserts the rendered page contains no trace of it, and
       this stylesheet is inlined into that page.) */
    /* ── The centred nav links ──────────────────────────────────────────
       DEFAULT is normal flow with auto margins — an in-flow flex item can
       never overlap its neighbours. True viewport-centring costs
       position:absolute, which takes the pill OUT of flow and so CAN collide
       with the brand and action bands once they grow; at ~1024px they do.
       So absolute centring is opted into only at ≥1200px, where the measured
       bands (brand 151px + actions ≈ 520px + mark 50px) leave the centre
       clear. Below that the pill floats between them instead — visually the
       same intent, structurally incapable of overlapping. */
    .lp-nav-links {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 2px;
        flex: 0 0 auto;
        margin: 0 auto;
        padding: 4px 6px;
        background: rgba(255,255,255,0.13);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(255,255,255,0.24);
        border-radius: 999px;
    }
    @media (min-width: 1200px) {
        .lp-nav-links {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            margin: 0;
        }
    }
    /* 769–1023px: the four CTAs + the mark cannot all fit beside a centred
       pill. Drop the two quietest (they remain reachable from /contact and
       the hero CTA respectively); the emphasis ramp keeps its top two. */
    @media (max-width: 1023px) and (min-width: 769px) {
        .lp-nav-link { padding: 5px 9px; font-size: 11.5px; }
    }
    /* Shared by the <a> links AND by the dropdown trigger <button>s that
       SolutionsDropdown/ResourcesDropdown inject — hence the button resets. */
    .lp-nav-link {
        /* Founder round 5 (2026-08-10): top-nav type at ~90% — 13.5px/7x13
           -> 12px/5x11, so the pill reads quieter under the hero. */
        font-size: 12px;
        color: #ffffff;
        text-decoration: none;
        font-weight: 500;
        padding: 5px 11px;
        border-radius: 999px;
        transition: background 0.12s, color 0.12s;
        display: flex;
        align-items: center;
        gap: 3px;
        background: none;
        border: none;
        font-family: var(--app-font);
        cursor: pointer;
        white-space: nowrap;
    }
    .lp-nav-link:hover { background: rgba(255,255,255,0.20); color: #ffffff; }
    .lp-nav-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        margin-left: auto;
    }
    /* ── The tile mark — closes the header on the RIGHT (founder brief).
       Fixed height with width:auto so the intrinsic 128×131 ratio is kept and
       CLS is 0 (the <img> carries width/height attributes). The source PNG is
       alpha-matted around the tile, so the rounded corners sit cleanly on the
       violet bar; the subtle ring just separates the two violets. */
    /* Round 3 (founder): the mark is a SEAMLESS strip — the pyramid on its own
       violet field, flush with the bar's left edge (negative margin cancels the
       bar padding), full bar height, and mask-faded rightward so the strip's
       gradient melts into the bar's token gradient. No radius, no ring, no
       drop shadow: the shadow is baked into the photograph. */
    .lp-nav-mark {
        display: block;
        height: 64px;
        width: auto;
        flex-shrink: 0;
        margin-left: -18px;
        margin-right: 4px;
        -webkit-mask-image: linear-gradient(to right, #000 55%, transparent 100%);
        mask-image: linear-gradient(to right, #000 55%, transparent 100%);
    }
    /* Shared pill geometry for the four action CTAs. */
    .lp-nav-login,
    .lp-nav-demo {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        font-family: var(--app-font);
        /* Founder round 5: action pills track the smaller nav type (13.5 -> 12px). */
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
        text-decoration: none;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        transition: background 0.16s, border-color 0.16s, color 0.16s, transform 0.16s;
    }
    /* The emphasis ramp is UNCHANGED (text → outlined → tinted → solid); only
       the ground it sits on flipped from pale lavender to violet, so each step
       inverts. Contrast is stated per pill against the #6600FF bar. */
    /* 1 — Contact sales: quietest, plain text. #fff on #6600FF = 8.1:1. */
    .lp-nav-contact:hover { background: rgba(255,255,255,0.16); color: #ffffff; }
    /* 2 — Log in: outlined in white. */
    .lp-nav-login {
        background: rgba(255,255,255,0.10);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.55);
        color: #ffffff;
        font-weight: 600;
        padding: 6px 14px;
    }
    .lp-nav-login:hover { background: rgba(255,255,255,0.20); border-color: #ffffff; }
    /* 3 — Get started for free: tinted secondary. */
    .lp-nav-cta:hover { background: rgba(255,255,255,0.32); transform: translateY(-1px); }
    /* 4 — Book a demo: THE primary, INVERTED. On the old pale bar this was a
       solid #6600FF pill; on a #6600FF bar that pill would disappear, so it
       flips to solid white with #4A00B7 text (16.9:1). Still white + purple,
       still no black (memory: preview-color-unified-pryzm-purple). */
    .lp-nav-demo {
        background: #ffffff;
        border: 1px solid #ffffff;
        color: #4A00B7;
        font-weight: 600;
        padding: 7px 16px;
        box-shadow: 0 6px 18px rgba(20,0,60,0.24);
    }
    .lp-nav-demo:hover { background: #F2ECFF; border-color: #F2ECFF; transform: translateY(-1px); }
    /* C43 — visible focus on every header control. The ring must clear the
       VIOLET bar now, so it is white (8.1:1 on #6600FF) with a violet outer
       offset ring so it also reads if a control's own fill is white. */
    .lp-nav-link:focus-visible,
    .lp-nav-contact:focus-visible,
    .lp-nav-login:focus-visible,
    .lp-nav-cta:focus-visible,
    .lp-nav-demo:focus-visible,
    .lp-nav-brand:focus-visible,
    .lp-hamburger:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
        box-shadow: 0 0 0 4px rgba(20,0,60,0.35);
    }

    /* ─── Hero — full-bleed video (founder brief 2026-08-09) ───────────
       KRETZ-modelled: the video fills the viewport directly under the bar and
       the copy floats in a glass control centred on it. This REVERSES the
       2026-08-07 note above ("the hero no longer claims a full viewport") —
       the reference is explicitly a viewport-filling hero, and the product
       showcase now lives one scroll down.

       100dvh (not 100vh) so mobile browser chrome collapsing does not leave a
       gap or cause a jump; 64px is .lp-nav's min-height. min-height keeps the
       panel from being crushed on short landscape phones.
    ────────────────────────────────────────────────────────────────── */
    .lp-hero {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px 24px 40px;
        text-align: center;
        position: relative;
    }
    .lp-hero--video {
        height: calc(100dvh - 64px);
        min-height: 420px;
        padding: 24px;
        overflow: hidden;
        /* The bar is sticky; without an explicit stacking context the video
           can paint over the mobile drawer. */
        isolation: isolate;
    }

    /* ── The video plate ─────────────────────────────────────────────────
       The gradient IS the fallback surface: it paints before the poster
       decodes, it is what shows under prefers-reduced-motion, and it is what
       shows if the MP4 fails to load. There is therefore no state in which
       this hero is black or empty. Colours are the same violet family the
       poster LQIP was generated from, so the swap is invisible. */
    .lp-hero-media {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background:
            radial-gradient(ellipse 85% 90% at 28% 30%, #6600FF 0%, transparent 70%),
            radial-gradient(ellipse 75% 80% at 78% 78%, #4A00B7 0%, transparent 72%),
            #1A0640;
        z-index: 0;
    }
    .lp-hero-video {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        /* Never let a decorative video widen the document. */
        max-width: 100%;
    }
    /* Scrim — the copy must clear AA over ANY frame of an unknown video.
       Deep violet, not black (brand: white + purple, no black). */
    .lp-hero-media::after {
        content: '';
        position: absolute;
        inset: 0;
        background:
            linear-gradient(to right,  rgba(26,6,64,0.46) 0%, rgba(26,6,64,0.16) 52%, rgba(26,6,64,0.00) 100%),
            linear-gradient(to bottom, rgba(26,6,64,0.34) 0%, rgba(26,6,64,0.15) 38%, rgba(26,6,64,0.56) 100%);
        pointer-events: none;
    }
    /* ── White outro bridge (rounds 6) ───────────────────────────────────
       hero.mp4 ENDS on a white frame; the next section (.lp-vsec--fade)
       opens under a matching white gradient. This ::before paints the hero's
       half of that bridge: a short white ramp at the very bottom of the
       frame, ABOVE the scrim (z-index 1 beats the ::after's auto), so the
       video's white outro melts across the section boundary instead of
       hitting the violet scrim. CSS-only — no scroll-jacking, no JS. */
    .lp-hero-media::before {
        content: '';
        position: absolute;
        left: 0; right: 0; bottom: 0;
        height: 16dvh;
        z-index: 1;
        background: linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.82) 72%, #ffffff 100%);
        pointer-events: none;
    }

    /* ── The copy column — bottom-left, no card ──────────────────────────
       2026-08-10 (founder brief, reference homepage). The glass panel is
       RETIRED. The reference sets type directly on the film and anchors it
       bottom-left; a bordered blurred card reads as a dialog and boxes the
       hierarchy in, which is the one thing the brief asked to undo.

       Removing the card removes a guaranteed backdrop, so legibility moves to
       the scrim above, which is now weighted to the LEFT as well as the bottom.
       Worst case is a pure-white video frame: at the bottom-left the two
       gradients composite to ~0.90 alpha of #1A0640, i.e. an effective backdrop
       near #33215A (rel. luminance ≈ 0.021) — #ffffff clears ~17:1 there,
       against the 4.5:1 the normal-size supporting line needs (C43 §1.5). The
       scrim is opaque enough that this holds for ANY frame, which is the whole
       point of not depending on the video's own content.
    ────────────────────────────────────────────────────────────────── */
    .lp-hero-panel {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-align: left;
        width: min(1180px, 100%);
        margin-right: auto;
        padding: 0;
    }
    /* Left rag + bottom anchor. Scoped to the video hero so any surface still
       using the pale-ground centred hero is untouched. */
    .lp-hero--video {
        align-items: flex-start;
        justify-content: flex-end;
        text-align: left;
        /* Founder 2026-08-10: block lifted off the lower edge (72 -> 148 ->
           190px), then round 5 same day: 190 -> 300px. Round 6 (same day):
           the CTA was STILL below the fold on the founder's screen, and a
           fixed pixel offset can never track the viewport — so the offset now
           SCALES with viewport height: max(300px, 38dvh). At 1080p that is
           ~410px, at a ~900px laptop ~342px — eyebrow, headline, subtitle AND
           the "Start here" button all sit comfortably in the upper two-thirds
           at both heights, and 300px remains the floor on short viewports. */
        padding: 24px 56px max(300px, 38dvh);
    }

    /* ─── The date eyebrow — small, uppercase, widely tracked ──────────
       Sits ABOVE the headline and is the first thing in the reading order,
       matching the reference's mission-date line. 13px at 600 weight in white
       over the scrim is normal-size text and clears AA by a wide margin. */
    .lp-hero-dateline {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: clamp(11px, 0.95vw, 13px);
        font-weight: 600;
        letter-spacing: 0.30em;
        color: #4A00B7;
        text-transform: uppercase;
        margin: 0 0 16px;
        line-height: 1;
    }

    /* Hero logo block REMOVED 2026-08-10 (founder brief): the centred pyramid
       competed with the headline for the same focal point, and the mark now lives
       once in the nav. The 3-D spinner mount went with it — rules deleted rather
       than left dead so the next editor is not misled by an unused selector. */
    /* Scale the lg spinner (44×56 px base) — 50% of original 2.8× hero size */
    .lp-hero-spinner {
        transform: scale(1.4);
        transform-origin: center center;
        overflow: visible;
        flex-shrink: 0;
    }
    /* logo-name is removed from DOM in PRYZM4 hero — kept as hidden no-op */
    .lp-hero-logo-name { display: none; }

    /* The small product-name line that used to sit between the glyph and the
       headline is GONE (2026-08-10): the date eyebrow above now occupies that
       slot, and the product name opens the supporting line instead. Rules
       deleted rather than left dead. */

    /* ─── Hero heading — "DEVELOPMENT. COMPUTED." ───────────────────────
       COLOUR RULING (2026-08-07, measured — do not "restore" white).
       The founder chose PRYZM purple over black. The background stayed the
       animated lavender field, so the choice was re-measured against it
       (WCAG 2.1 relative luminance, gradient sampled at its lightest #f3f0ff
       and darkest #b8a2ff):
         #6600FF → 6.22:1 lightest, 3.07:1 darkest → PASSES AA large text
         #ffffff → 1.12:1 lightest, 2.27:1 darkest → FAILS everywhere
       So purple is BOTH what the founder asked for and the only one that
       passes. The old white treatment leaned on a text-shadow, not contrast.
       The subhead is normal-size text (needs 4.5:1), which #6600FF does not
       clear at the darkest point — it uses pryzm-purple-darker #4A00B7
       (4.68:1 darkest / 9.48:1 lightest). Both are C43 §1.5 tokens.
    ────────────────────────────────────────────────────────────────── */
    .lp-hero-heading {
        font-size: clamp(30px, 6.0vw, 88px);
        font-weight: 800;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.02;
        color: #6600FF;
        margin: 0 0 20px;
        letter-spacing: -0.03em;
        max-width: none;
        text-transform: uppercase;
    }

    /* ─── Hero supporting line — product name + the positioning sentence ── */
    .lp-hero-sub {
        font-size: clamp(14px, 1.35vw, 18px);
        color: #4A00B7;
        line-height: 1.5;
        margin: 0 0 30px;
        max-width: 540px;
        font-weight: 500;
        letter-spacing: 0.01em;
    }
    /* The product name leads the line at heavier weight — it is a label, not a
       separate block, so it stays inline and inherits the same size. */
    .lp-hero-sub-brand {
        font-weight: 700;
        letter-spacing: 0.05em;
        color: #4A00B7;
    }

    /* ─── Video-hero colour override (2026-08-09) ──────────────────────
       The measured ruling above applies to the PALE LAVENDER ground. The
       video hero's ground is the violet scrim (#1A0640 at 0.24–0.58 over an
       unknown frame), where #6600FF text would fail outright. Over that
       scrim's LIGHTEST point the effective backdrop is still darker than
       #6B4FB0 (rel. luminance ≤ 0.17), so #ffffff clears 4.5:1 for the
       normal-size subhead and far more for the display heading. White is the
       only choice that holds over an unknown video, and it is a brand colour.
       Scoped to .lp-hero--video so the pale-ground ruling stays intact for
       any surface that still uses it. */
    .lp-hero--video .lp-hero-heading { color: #ffffff; }
    .lp-hero--video .lp-hero-sub { color: rgba(255,255,255,0.94); }
    .lp-hero--video .lp-hero-dateline { color: rgba(255,255,255,0.88); }
    .lp-hero--video .lp-hero-sub-brand { color: #ffffff; }
    /* The video hero's headline is SMALLER than the pale-ground one (founder
       brief 2026-08-10): the reference keeps it bold and dominant but nowhere
       near viewport-filling, and shrinking it is what makes room for the
       eyebrow above and the supporting line below to read as one hierarchy
       rather than three competing blocks. */
    .lp-hero--video .lp-hero-heading {
        /* Round 4 (founder, SpaceX reference): tighter leading + tracking and
           a heavier cut so the two lines read as one dense block, per the
           reference's condensed mission titles. */
        font-size: clamp(30px, 4.0vw, 58px);
        letter-spacing: -0.035em;
        line-height: 0.98;
        font-weight: 900;
        margin: 0 0 18px;
        max-width: 16ch;
    }
    .lp-hero--video .lp-hero-sub { max-width: 620px; }
    /* Primary CTA over video: solid white, purple text (16.9:1) — the same
       inversion the header's "Book a demo" pill takes on the violet bar. */
    .lp-hero--video .lp-hero-btn {
        background: #ffffff;
        border-color: #ffffff;
        color: #4A00B7;
        /* Round 4 (founder): CTA at ~50% — the reference's WATCH button is a
           quiet, small affordance under the title, not a billboard. */
        font-size: 13px;
        font-style: normal;
        font-weight: 600;
        letter-spacing: 0.02em;
        padding: 7px 15px;
        min-height: 0;
        box-shadow: 0 6px 18px rgba(12,0,40,0.30);
    }
    .lp-hero--video .lp-hero-btn:hover {
        background: #F2ECFF;
        filter: none;
    }
    .lp-hero--video .lp-hero-btn:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 3px;
        box-shadow: 0 0 0 5px rgba(20,0,60,0.40);
    }

    /* ─── AMA fade-in animation — mirrors MIAW CursorPrompt.css entry ────
       Slides up 20px while fading in — same easing as MIAW logoFadeUp.
       Applied to heading, subtitle, and CTA with increasing delays so
       each element arrives sequentially (heading → sub → button).
    ────────────────────────────────────────────────────────────────── */
    @keyframes lp-ama-fadein {
        from { opacity: 0; transform: translateY(20px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* Staggered entrance on hero elements — the eyebrow arrives FIRST, so the
       motion reads in the same order as the type hierarchy. */
    .lp-hero-dateline {
        animation: lp-ama-fadein 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        animation-delay: 0s;
    }
    .lp-hero-heading {
        animation: lp-ama-fadein 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
        animation-delay: 0.15s;
    }
    .lp-hero-sub {
        animation: lp-ama-fadein 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        animation-delay: 0.42s;
    }

    /* ─── Hero CTA row — left-ragged with the rest of the column. ────── */
    .lp-hero-ctas {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: flex-start;
        flex-wrap: wrap;
        margin-bottom: 0;
        transform: none;
    }

    /* ─── Floating "alive" bob — runs forever after the entrance ─────── */
    @keyframes lp-btn-float {
        0%   { transform: translateY(0px); }
        50%  { transform: translateY(-9px); }
        100% { transform: translateY(0px); }
    }

    /* ─── "Start here" glass-pill CTA — MIAW CursorPrompt style ──────────
       entrance: fades up at 0.75s delay (0.75s duration → done at 1.5s)
       float:    gentle bob begins at 1.6s, loops every 3.4s — "alive" feel
       Hover brightens via filter so it doesn't fight the transform animation.
    ────────────────────────────────────────────────────────────────── */
    .lp-hero-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.28);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 999px;
        font-size: 9px;
        font-weight: 300;
        font-style: italic;
        padding: 8px 17px;
        cursor: pointer;
        font-family: var(--app-font);
        letter-spacing: 0.06em;
        white-space: nowrap;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        transition: background 0.18s, box-shadow 0.18s, filter 0.18s;
    }
    .lp-hero-btn--enter {
        animation:
            lp-ama-fadein 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.75s both,
            lp-btn-float  3.4s ease-in-out 1.6s infinite;
    }
    .lp-hero-btn:hover {
        background: rgba(0,0,0,0.44);
        filter: brightness(1.18);
        box-shadow: 0 8px 28px rgba(60,10,160,0.26);
        animation-play-state: paused;
    }
    .lp-hero-btn:active {
        filter: brightness(0.92);
    }
    @media (prefers-reduced-motion: reduce) {
        .lp-hero-dateline, .lp-hero-heading, .lp-hero-sub, .lp-hero-btn--enter { animation: none; }
        .lp-hero-ctas { transform: none; }
        /* WCAG 2.1 SC 2.2.2 — no auto-playing motion for users who asked for
           none. The apex ships ZERO JS (CSP default-src 'none'), so the video
           cannot be paused programmatically; hiding it is the only CSS-only
           lever. .lp-hero-media's brand-violet gradient remains as the still
           backdrop, so the hero still reads exactly as designed.
           HONEST LIMIT: display:none stops the video PAINTING, and browsers
           throttle or refuse playback for non-rendered media, but the spec
           does not guarantee the bytes are never fetched. Eliminating the
           fetch entirely needs a <script> the apex is not allowed to have. */
        .lp-hero-video { display: none; }
        .lp-vsec-video { display: none; }
    }

    /* ─── Stacked full-viewport video sections (rounds 6, SpaceX ref) ─────
       Three more 100dvh sections after the hero: hero_02 → hero_03 → Hero_04.
       The nav bar is sticky, so these deliberately run the FULL viewport and
       slide under it — the SpaceX treatment. Each carries a small bottom-left
       caption block (eyebrow + label) over the same violet scrim family as
       the hero, so legibility never depends on the video's own content.
       Fallback ground (paints before/without the video) is the same violet
       radial field as .lp-hero-media — there is no state where a section is
       empty or black-on-white. */
    .lp-vsec {
        position: relative;
        height: 100dvh;
        min-height: 420px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-end;
        overflow: hidden;
        isolation: isolate;
        padding: 24px 56px 96px;
    }
    .lp-vsec-media {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background:
            radial-gradient(ellipse 85% 90% at 28% 30%, #6600FF 0%, transparent 70%),
            radial-gradient(ellipse 75% 80% at 78% 78%, #4A00B7 0%, transparent 72%),
            #1A0640;
        z-index: 0;
    }
    .lp-vsec-video {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        max-width: 100%;
    }
    /* Caption scrim — lighter than the hero's (a label, not a headline, sits
       here) but still weighted to the bottom-left corner the copy occupies.
       Deep violet, never black (brand ruling). */
    .lp-vsec-media::after {
        content: '';
        position: absolute;
        inset: 0;
        background:
            linear-gradient(to right,  rgba(26,6,64,0.32) 0%, rgba(26,6,64,0.10) 48%, rgba(26,6,64,0.00) 100%),
            linear-gradient(to bottom, rgba(26,6,64,0.00) 55%, rgba(26,6,64,0.52) 100%);
        pointer-events: none;
    }
    .lp-vsec-panel {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-align: left;
        width: min(1180px, 100%);
        margin-right: auto;
    }
    .lp-vsec-eyebrow {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: clamp(11px, 0.95vw, 13px);
        font-weight: 600;
        letter-spacing: 0.30em;
        color: rgba(255,255,255,0.88);
        text-transform: uppercase;
        margin: 0 0 12px;
        line-height: 1;
    }
    .lp-vsec-title {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: clamp(24px, 2.6vw, 40px);
        font-weight: 900;
        letter-spacing: -0.03em;
        line-height: 1.0;
        color: #ffffff;
        text-transform: uppercase;
        margin: 0;
        max-width: 20ch;
    }
    /* Transition 1 — hero → hero_02: SMOOTH. hero.mp4's white outro (bridged
       by .lp-hero-media::before above) melts into this section under a long
       white gradient falling from its top edge. Scroll-linked in effect but
       purely paint: as the boundary crosses the viewport the two gradients
       read as one continuous white field dissolving into the video. */
    .lp-vsec--fade::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 30dvh;
        z-index: 2;
        background: linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.55) 42%, rgba(255,255,255,0) 100%);
        pointer-events: none;
    }
    /* Transition 3 — hero_03 → Hero_04: STRAIGHT. Video 4 is dark content;
       the section takes a clean hard edge (no bridge, no blend) and its
       fallback ground drops to the deepest violet so even the pre-video
       frame reads dark. */
    .lp-vsec--dark .lp-vsec-media {
        background: #0E0420;
    }

    /* Product-showcase styles (the Paris 3D-Site screenshot plate) DELETED
       2026-08-10 (founder, rounds 6) with the section itself — the stacked
       video sections carry the product story now. */

    /* ─── Hero feature tags ───────────────────────────────────────────── */
    .lp-hero-tags {
        display: flex;
        gap: 0;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        color: rgba(90,77,122,0.72);
        font-size: 12.5px;
        letter-spacing: 0.01em;
    }
    .lp-hero-tag {
        padding: 0 12px;
        border-right: 1px solid rgba(139,92,246,0.22);
        line-height: 1;
    }
    .lp-hero-tag:last-child { border-right: none; }
    .lp-hero-tag:first-child { padding-left: 0; }

    /* ─── Legacy compat — mosaic tiles kept for graceful no-op ──────────
       LandingPageMosaic queries .lp-mosaic-container; since it is absent
       from the PRYZM4 hero layout the mosaic constructor simply skips.
       These rules are retained so any external tooling that references
       the class names doesn't produce parser errors. ──────────────────── */
    .lp-mosaic-container { display: none; }
    .lp-mosaic-track, .lp-mosaic-inner, .lp-mosaic-tile,
    .lp-mosaic-tile--placeholder, .lp-mosaic-media { display: none; }

    /* ─── Legacy hero-card — kept for backward compat, not rendered ───── */
    .lp-hero-card { display: none; }

    /* ─── Feature strip — legacy, not rendered in PRYZM4 ─────────────── */
    .lp-features { display: none; }
    .lp-feature, .lp-feature-icon, .lp-feature-text,
    .lp-feature-title, .lp-feature-desc { display: none; }

    /* ─── Legacy compat classes (retained, not rendered) ─────────────── */
    .lp-hero-bg, .lp-hero-cards, .lp-preview-card,
    .lp-slider-container, .lp-slider-slide, .lp-slider-media,
    .lp-slider-fallback, .lp-hero-overlay { display: none; }

    /* ── Scroll-reveal utility (used by LandingPageScrollReveal.ts) ──── */
    .lp-reveal {
        opacity: 0;
        transform: translateY(40px);
        transition: opacity 0.65s ease, transform 0.65s ease;
    }
    .lp-reveal--visible {
        opacity: 1;
        transform: translateY(0);
    }

    /* ── Stream 2 — Bespoke / Enterprise section ─────────────────────── */
    .lp-bespoke {
        width: 100%;
        background: var(--app-violet-soft);
        padding: 80px 24px;
        box-sizing: border-box;
    }
    .lp-bespoke-inner {
        max-width: 1100px;
        margin: 0 auto;
        display: flex;
        gap: 64px;
        align-items: center;
    }
    .lp-bespoke-col { flex: 1; }
    .lp-bespoke-heading {
        font-size: 28px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0 0 16px;
        letter-spacing: -0.3px;
        line-height: 1.25;
    }
    .lp-bespoke-desc {
        font-size: 15px;
        color: var(--app-text-2);
        line-height: 1.6;
        margin: 0 0 28px;
    }
    .lp-bespoke-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }
    .lp-bespoke-actions button:first-child {
        height: 44px;
        padding: 0 24px;
        background: var(--app-gradient);
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        border: none;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-family: var(--app-font);
        box-shadow: var(--app-shadow-glow);
        transition: opacity 0.15s, transform 0.12s;
    }
    .lp-bespoke-actions button:first-child:hover { opacity: 0.88; transform: translateY(-1px); }
    .lp-bespoke-actions button:last-child {
        height: 44px;
        padding: 0 24px;
        background: transparent;
        color: var(--app-violet-1);
        font-size: 14px;
        font-weight: 600;
        border: 1.5px solid var(--app-violet-1);
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.15s, color 0.15s;
    }
    .lp-bespoke-actions button:last-child:hover {
        background: var(--app-violet-soft);
        color: var(--app-violet-2);
    }
    .lp-bespoke-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .lp-bespoke-list li {
        font-size: 14px;
        color: var(--app-text-2);
        padding-left: 20px;
        position: relative;
        line-height: 1.5;
    }
    .lp-bespoke-list li::before {
        content: "✓";
        position: absolute;
        left: 0;
        color: var(--app-violet-1);
        font-weight: 700;
    }
    @media (max-width: 768px) {
        .lp-bespoke-inner { flex-direction: column; gap: 32px; }
    }
    /* RELOCATED 2026-08-07 (apex header pass): this block used to live at the
       tail of SOLUTIONS_STYLES, which prerender-apex.mjs does NOT inline — so
       the apex shipped with NO hamburger / drawer / responsive rules at all.
       That was invisible only because .lp-nav was display:none; un-hiding the
       nav exposed an unstyled drawer on desktop. These are LANDING styles and
       belong in LANDING_PAGE_STYLES. */
    /* ─────────────────────────────────────────────────────────────────── */
    /* MOB-001-LP  Mobile Responsiveness                                   */
    /* Contract: docs/05-guides/mobile/MOBILE_CONTRACT.md §2.3                       */
    /* ─────────────────────────────────────────────────────────────────── */

    /* ── Hamburger button (visible on mobile only) ─────────────────────── */
    .lp-hamburger {
        display: none;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        background: none;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        /* White: the bar it sits on is now #6600FF (8.1:1). */
        color: #ffffff;
        flex-shrink: 0;
        transition: background 0.12s;
        margin-left: 6px;
    }
    .lp-hamburger:hover { background: rgba(255,255,255,0.18); }
    .lp-hamburger svg { display: block; }

    /* ── Mobile nav drawer ─────────────────────────────────────────────── */
    .lp-mobile-drawer {
        display: none;
        flex-direction: column;
        background: #ffffff;
        border-bottom: 1px solid #ebebeb;
        overflow: hidden;
        max-height: 0;
        transition: max-height 0.3s ease;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 100;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }
    .lp-mobile-drawer--open {
        max-height: 600px;
    }
    .lp-mobile-drawer-links {
        display: flex;
        flex-direction: column;
        padding: 8px 0;
        border-bottom: 1px solid #f0f0f0;
    }
    .lp-mobile-drawer-link {
        display: flex;
        align-items: center;
        min-height: 44px;
        padding: 10px 20px;
        font-size: 15px;
        font-weight: 500;
        color: #1a1a1a;
        text-decoration: none;
        background: none;
        border: none;
        font-family: var(--app-font);
        cursor: pointer;
        text-align: left;
        transition: background 0.12s;
    }
    .lp-mobile-drawer-link:hover { background: #f5f5f5; }
    .lp-mobile-drawer-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px 20px;
        padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    }
    .lp-mobile-drawer-login {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        background: none;
        border: 1.5px solid #1a1a1a;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        color: #1a1a1a;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.12s;
    }
    .lp-mobile-drawer-login:hover { background: #f5f5f5; }
    .lp-mobile-drawer-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        background: #111111;
        color: #fff;
        border: none;
        border-radius: 999px;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.15s;
    }
    .lp-mobile-drawer-cta:hover { background: #333; }
    /* Mobile "Book a demo" — the drawer's primary, mirroring .lp-nav-demo. */
    .lp-mobile-drawer-demo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        background: #6600FF;
        color: #ffffff;
        border: none;
        border-radius: 999px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        text-decoration: none;
        transition: background 0.15s;
    }
    .lp-mobile-drawer-demo:hover { background: #4A00B7; }
    .lp-mobile-drawer-contact {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        background: none;
        border: 1.5px solid rgba(26,26,26,0.55);
        border-radius: 999px;
        font-size: 14px;
        font-weight: 500;
        color: #1a1a1a;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.12s, border-color 0.12s;
    }
    .lp-mobile-drawer-contact:hover { background: rgba(0,0,0,0.05); border-color: rgba(26,26,26,0.80); }

    /* ─────────────────────────── @media ≤768px ─────────────────────────── */
    @media (max-width: 768px) {
        /* Navbar: compact. Keeps position:relative from the base rule so the
           absolutely-positioned drawer still resolves against it. */
        .lp-nav {
            align-items: center;
            min-height: 56px;
            padding: 0 12px;
        }
        /* Hide desktop nav links and the four action CTAs. The ACTIONS ROW
           itself stays laid out — the tile mark lives inside it, and the
           founder's brief puts that mark on the right at every width. */
        .lp-nav-links { display: none; }
            .lp-nav-login,
            .lp-nav-demo { display: none; }
        .lp-nav-actions { gap: 4px; }
        .lp-nav-mark { height: 56px; margin-left: -12px; margin-right: 2px; }
        /* Show hamburger */
        .lp-hamburger { display: flex; }
        /* Show mobile drawer */
        .lp-mobile-drawer { display: flex; }

        /* ── APEX mobile header (C51 §2.1.1: correct with JS DISABLED) ──
           The hamburger + drawer are a JS affordance, so mode:'apex' does not
           emit them at all. Instead the apex header WRAPS to two rows —
           brand + "Book a demo" on row 1, the links pill centred on row 2 —
           which keeps every nav destination reachable and crawlable on a
           390px viewport with zero script. */
        .lp-nav--apex {
            flex-wrap: wrap;
            height: auto;
            align-items: center;
            padding: 10px 12px;
            row-gap: 8px;
        }
        /* The links pill is absolutely positioned on desktop; on the wrapped
           apex header it must return to NORMAL FLOW to occupy row 2. */
        .lp-nav--apex .lp-nav-links {
            display: flex;
            position: static;
            transform: none;
            order: 3;
            flex: 1 0 100%;
            justify-content: center;
            margin: 0;
        }
        .lp-nav--apex .lp-nav-link { padding: 7px 11px; font-size: 13px; }
        .lp-nav--apex .lp-nav-actions { display: flex; margin: 0 0 0 auto; }
        /* Only the primary CTA survives the narrow row (plus the tile mark). */
        .lp-nav--apex .lp-nav-contact,
        .lp-nav--apex .lp-nav-login,
        .lp-nav--apex        .lp-nav--apex .lp-nav-demo { display: inline-flex; padding: 9px 16px; font-size: 13px; }

        /* Scale down logo */
        .lp-logo-icon { width: 36px; height: 36px; }
        .lp-nav-brand { gap: 10px; min-width: 0; }

        /* Hero: full-width, single centred column */
        .lp-hero {
            padding: 12px 16px 28px;
            justify-content: center;
        }
        /* 56px is the mobile .lp-nav min-height. */
        .lp-hero--video {
            height: calc(100dvh - 56px);
            min-height: 460px;
            padding: 16px 20px 44px;
        }
        .lp-hero-panel {
            width: 100%;
            padding: 0;
        }
        .lp-hero--video .lp-hero-btn {
            width: 100%;
            justify-content: center;
        }
        .lp-hero--video .lp-hero-ctas { width: 100%; }
        .lp-hero-card {
            padding: 32px 24px 36px;
            max-width: 100%;
            width: 100%;
        }
        .lp-hero-dateline { font-size: 11px; letter-spacing: 0.26em; margin-bottom: 12px; }
        .lp-hero-heading,
        .lp-hero--video .lp-hero-heading {
            font-size: 34px;
            letter-spacing: -0.02em;
            max-width: none;
            margin-bottom: 14px;
        }
        .lp-hero-sub,
        .lp-hero--video .lp-hero-sub {
            font-size: 14px;
            max-width: 100%;
            margin-bottom: 24px;
        }

        /* Showcase responsive rules deleted with the section (2026-08-10). */

        /* Bespoke section */
        .lp-bespoke { padding: 48px 16px; }
        .lp-bespoke-inner { flex-direction: column; gap: 28px; }
        .lp-bespoke-actions { flex-direction: column; }
        .lp-bespoke-actions button:first-child,
        .lp-bespoke-actions button:last-child {
            width: 100%;
            justify-content: center;
        }

        /* Solutions/Resources dropdowns: hide on mobile (drawer replaces them) */
        .lp-res-dropdown,
        .lp-sol-dropdown { display: none !important; }

        /* Resource/Solutions pages: reduce padding */
        .lp-res-page-header,
        .lp-sol-page-header { padding: 0 16px; }
        .lp-res-page-content,
        .lp-sol-page-content { padding: 0 16px; }
    }

    /* ─────────────────────────── @media ≤480px ─────────────────────────── */
    @media (max-width: 480px) {
        .lp-hero-card {
            padding: 24px 16px 28px;
        }
        .lp-hero-heading,
        .lp-hero--video .lp-hero-heading {
            font-size: 28px;
            letter-spacing: -0.02em;
        }
        .lp-hero-sub,
        .lp-hero--video .lp-hero-sub { font-size: 13px; }
        .lp-hero-dateline { font-size: 10.5px; letter-spacing: 0.24em; }
        .lp-hero-btn {
            width: 100%;
            text-align: center;
            padding: 15px 28px;
        }
        .lp-bespoke { padding: 36px 12px; }
        .lp-bespoke-heading { font-size: 22px; }
    }
`;

export const RESOURCES_STYLES = `
    /* ── Trigger wrapper ──────────────────────────────────────────────── */
    .lp-res-nav-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
    }
    .lp-res-nav-btn {
        background: none;
        border: none;
        font-family: var(--app-font);
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }
    .lp-res-chevron {
        display: inline-block;
        transition: transform 0.2s ease;
        transform: rotate(0deg);
        opacity: 0.55;
        flex-shrink: 0;
    }
    .lp-res-nav-btn--open .lp-res-chevron {
        transform: rotate(180deg);
        opacity: 0.8;
    }
    .lp-res-nav-btn--open {
        background: #f0ecff;
        color: var(--app-violet-2);
    }

    /* ── Dropdown panel ───────────────────────────────────────────────── */
    .lp-res-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        background: #ffffff;
        border: 1px solid #e8e8ee;
        border-radius: 14px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06);
        padding: 20px 20px 16px;
        min-width: 520px;
        z-index: 9000;
        animation: lp-res-dropdown-in 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    @keyframes lp-res-dropdown-in {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Columns ──────────────────────────────────────────────────────── */
    .lp-res-cols {
        display: flex;
        gap: 0;
    }
    .lp-res-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 8px;
    }
    .lp-res-col:first-child { padding-left: 0; }
    .lp-res-col-sep {
        width: 1px;
        background: #ebebeb;
        margin: 4px 8px;
        align-self: stretch;
        flex-shrink: 0;
    }
    .lp-res-col-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--app-text-muted);
        padding: 0 8px;
        margin: 0 0 6px;
    }

    /* ── Menu items ───────────────────────────────────────────────────── */
    .lp-res-item {
        display: flex;
        align-items: flex-start;
        gap: 0;
        padding: 9px 10px;
        border-radius: 9px;
        cursor: pointer;
        border: none;
        background: none;
        font-family: var(--app-font);
        text-align: left;
        width: 100%;
        transition: background 0.12s;
    }
    .lp-res-item:hover { background: #f5f2ff; }
    .lp-res-item-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .lp-res-item-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--app-text);
        line-height: 1.3;
    }
    .lp-res-item-desc {
        font-size: 11px;
        color: var(--app-text-2);
        line-height: 1.4;
    }

    /* ── Divider ──────────────────────────────────────────────────────── */
    .lp-res-divider {
        height: 1px;
        background: #ebebeb;
        margin: 0 -4px;
    }

    /* ── Footer links ─────────────────────────────────────────────────── */
    .lp-res-footer {
        display: flex;
        gap: 8px;
    }
    .lp-res-footer-link {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1.5px solid var(--app-border);
        background: none;
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
        white-space: nowrap;
    }
    .lp-res-footer-link:hover {
        border-color: var(--app-violet-1);
        color: var(--app-violet-2);
        background: var(--app-violet-soft);
    }
    .lp-res-footer-arrow {
        font-size: 12px;
        opacity: 0.7;
    }

    /* ── Full-screen content page ─────────────────────────────────────── */
    .lp-res-page {
        position: fixed;
        inset: 0;
        background: #f9fafb;
        z-index: 9500;
        display: flex;
        flex-direction: column;
        font-family: var(--app-font);
        color: var(--app-text);
        animation: lp-res-page-in 0.22s ease;
        overflow: hidden;
    }
    @keyframes lp-res-page-in {
        from { opacity: 0; transform: translateX(16px); }
        to   { opacity: 1; transform: translateX(0); }
    }
    .lp-res-page-header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 40px;
        height: 66px;
        background: #ffffff;
        border-bottom: 1px solid #ebebeb;
        flex-shrink: 0;
    }
    .lp-res-page-back {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        border: none;
        background: none;
        font-family: var(--app-font);
        padding: 6px 10px;
        border-radius: 6px;
        transition: background 0.12s, color 0.12s;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .lp-res-page-back:hover { background: #f5f5f5; color: var(--app-text); }
    .lp-res-page-header-sep {
        width: 1px;
        height: 22px;
        background: #e0e0e0;
        flex-shrink: 0;
    }
    .lp-res-page-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* ── Page body (scrollable) ───────────────────────────────────────── */
    .lp-res-page-body {
        flex: 1;
        overflow-y: auto;
        padding: 48px 0 80px;
    }
    .lp-res-page-content {
        max-width: 760px;
        margin: 0 auto;
        padding: 0 40px;
    }

    /* ── Content typography ───────────────────────────────────────────── */
    .lp-res-intro {
        font-size: 18px;
        font-weight: 500;
        color: var(--app-text-2);
        line-height: 1.6;
        margin: 0 0 36px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--app-border-light);
    }
    .lp-res-section-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--app-text);
        margin: 36px 0 14px;
        letter-spacing: -0.2px;
    }
    .lp-res-section-title:first-of-type { margin-top: 0; }
    .lp-res-p {
        font-size: 15px;
        color: var(--app-text-2);
        line-height: 1.7;
        margin: 0 0 16px;
    }
    .lp-res-list {
        margin: 0 0 20px;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .lp-res-list li {
        font-size: 15px;
        color: var(--app-text-2);
        line-height: 1.6;
    }

    /* ── Numbered steps ───────────────────────────────────────────────── */
    .lp-res-steps {
        display: flex;
        flex-direction: column;
        gap: 0;
    }
    .lp-res-step {
        display: flex;
        gap: 20px;
        padding: 20px 0;
        border-bottom: 1px solid var(--app-border-light);
    }
    .lp-res-step:last-child { border-bottom: none; }
    .lp-res-step-num {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--app-gradient);
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
    }
    .lp-res-step-body { flex: 1; }
    .lp-res-step-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--app-text);
        margin: 4px 0 6px;
    }
    .lp-res-step-p {
        font-size: 14px;
        color: var(--app-text-2);
        line-height: 1.65;
        margin: 0;
    }

    /* ── FAQ ──────────────────────────────────────────────────────────── */
    .lp-res-faq {
        display: flex;
        flex-direction: column;
        gap: 0;
    }
    .lp-res-faq-item {
        padding: 20px 0;
        border-bottom: 1px solid var(--app-border-light);
    }
    .lp-res-faq-item:last-child { border-bottom: none; }
    .lp-res-faq-q {
        font-size: 15px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0 0 8px;
    }
    .lp-res-faq-a {
        font-size: 14px;
        color: var(--app-text-2);
        line-height: 1.65;
        margin: 0;
    }

    /* ── Table ────────────────────────────────────────────────────────── */
    .lp-res-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 28px;
        font-size: 14px;
    }
    .lp-res-table th {
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--app-text-muted);
        padding: 0 12px 10px 0;
        border-bottom: 1px solid var(--app-border);
    }
    .lp-res-table td {
        padding: 11px 12px 11px 0;
        color: var(--app-text-2);
        border-bottom: 1px solid var(--app-border-light);
        vertical-align: middle;
    }
    .lp-res-table tr:last-child td { border-bottom: none; }
    .lp-res-table code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 12px;
        background: #f0f0f8;
        border: 1px solid var(--app-border-light);
        border-radius: 4px;
        padding: 2px 5px;
        color: var(--app-violet-2);
    }
    .lp-res-tick { color: #16a34a; font-weight: 700; }
    .lp-res-dash { color: var(--app-text-muted); }

    /* ── AI command reference ─────────────────────────────────────────── */
    .lp-res-cmd-group {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-bottom: 28px;
    }
    .lp-res-cmd-item {
        padding: 18px 0;
        border-bottom: 1px solid var(--app-border-light);
    }
    .lp-res-cmd-item:last-child { border-bottom: none; }
    .lp-res-cmd-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0 0 8px;
    }
    .lp-res-cmd-block {
        background: #f6f5ff;
        border: 1px solid #e2defd;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        color: var(--app-violet-2);
        line-height: 1.55;
        margin-bottom: 8px;
        font-style: normal;
    }
    .lp-res-cmd-desc {
        font-size: 13px;
        color: var(--app-text-2);
        line-height: 1.6;
        margin: 0;
    }

    /* ── Callout box ──────────────────────────────────────────────────── */
    .lp-res-callout {
        background: #f8f8f8;
        border: 1px solid var(--app-border);
        border-radius: 10px;
        padding: 16px 18px;
        font-size: 14px;
        color: var(--app-text-2);
        line-height: 1.6;
        margin-bottom: 24px;
    }
    .lp-res-callout--violet {
        background: #f6f5ff;
        border-color: #e2defd;
        color: var(--app-violet-2);
    }
    .lp-res-callout strong { color: var(--app-text); }
    .lp-res-callout--violet strong { color: var(--app-violet-2); }
`;

export const SOLUTIONS_STYLES = `
    /* ── Trigger wrapper ──────────────────────────────────────────────── */
    .lp-sol-nav-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
    }
    .lp-sol-nav-btn {
        background: none;
        border: none;
        font-family: var(--app-font);
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }
    .lp-sol-chevron {
        display: inline-block;
        transition: transform 0.2s ease;
        transform: rotate(0deg);
        opacity: 0.55;
        flex-shrink: 0;
    }
    .lp-sol-nav-btn--open .lp-sol-chevron {
        transform: rotate(180deg);
        opacity: 0.8;
    }
    .lp-sol-nav-btn--open {
        background: #f0ecff;
        color: var(--app-violet-2);
    }

    /* ── Dropdown panel ───────────────────────────────────────────────── */
    .lp-sol-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        background: #ffffff;
        border: 1px solid rgba(139,92,246,0.18);
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(102,0,255,0.12), 0 2px 8px rgba(0,0,0,0.06);
        padding: 18px 18px 14px;
        min-width: 600px;
        z-index: 9000;
        animation: lp-sol-dropdown-in 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    @keyframes lp-sol-dropdown-in {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Column headers ───────────────────────────────────────────────── */
    .lp-sol-col-headers {
        display: flex;
        gap: 0;
        padding: 0 6px;
    }
    .lp-sol-col-header {
        flex: 1;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--app-violet-2);
        padding: 0 8px;
    }
    .lp-sol-col-header:first-child { padding-left: 4px; }

    /* ── Columns ──────────────────────────────────────────────────────── */
    .lp-sol-cols {
        display: flex;
        gap: 0;
    }
    .lp-sol-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }
    .lp-sol-col-sep {
        width: 1px;
        background: #ebebeb;
        margin: 0 10px;
        align-self: stretch;
        flex-shrink: 0;
    }

    /* ── Menu items ───────────────────────────────────────────────────── */
    .lp-sol-item {
        display: flex;
        align-items: flex-start;
        gap: 0;
        padding: 9px 10px;
        border-radius: 9px;
        cursor: pointer;
        border: none;
        background: none;
        font-family: var(--app-font);
        text-align: left;
        width: 100%;
        transition: background 0.12s;
    }
    .lp-sol-item:hover { background: #f5f2ff; }
    .lp-sol-item-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .lp-sol-item-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--app-text);
        line-height: 1.3;
    }
    .lp-sol-item:hover .lp-sol-item-title { color: var(--app-violet-2); }
    .lp-sol-item-desc {
        font-size: 11px;
        color: var(--app-text-2);
        line-height: 1.4;
    }
    .lp-sol-item:hover .lp-sol-item-desc { color: var(--app-violet-1); opacity: 0.75; }

    /* ── Footer ───────────────────────────────────────────────────────── */
    .lp-sol-footer {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px 10px 2px;
        border-top: 1px solid #ebebeb;
        margin-top: 2px;
    }
    .lp-sol-footer-cta {
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        background: var(--app-gradient);
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        cursor: pointer;
        white-space: nowrap;
        transition: opacity 0.15s;
    }
    .lp-sol-footer-cta:hover { opacity: 0.85; }
    .lp-sol-footer-note {
        font-size: 12px;
        color: var(--app-text-muted);
    }

    /* ── Full-screen content page ─────────────────────────────────────── */
    .lp-sol-page {
        position: fixed;
        inset: 0;
        background: #f9fafb;
        z-index: 9500;
        display: flex;
        flex-direction: column;
        font-family: var(--app-font);
        color: var(--app-text);
        animation: lp-sol-page-in 0.22s ease;
        overflow: hidden;
    }
    @keyframes lp-sol-page-in {
        from { opacity: 0; transform: translateX(16px); }
        to   { opacity: 1; transform: translateX(0); }
    }
    .lp-sol-page-header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 40px;
        height: 66px;
        background: #ffffff;
        border-bottom: 1px solid #ebebeb;
        flex-shrink: 0;
    }
    .lp-sol-page-back {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        border: none;
        background: none;
        font-family: var(--app-font);
        padding: 6px 10px;
        border-radius: 6px;
        transition: background 0.12s, color 0.12s;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .lp-sol-page-back:hover { background: #f5f5f5; color: var(--app-text); }
    .lp-sol-page-header-sep {
        width: 1px;
        height: 22px;
        background: #e0e0e0;
        flex-shrink: 0;
    }
    .lp-sol-page-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .lp-sol-page-body {
        flex: 1;
        overflow-y: auto;
        padding: 48px 0 80px;
    }
    .lp-sol-page-content {
        max-width: 760px;
        margin: 0 auto;
        padding: 0 40px;
    }
    .lp-sol-tagline {
        font-size: 22px;
        font-weight: 700;
        color: var(--app-text);
        line-height: 1.35;
        margin: 0 0 28px;
        padding-bottom: 24px;
        border-bottom: 2px solid var(--app-violet-soft);
        letter-spacing: -0.3px;
    }

    /* ── Content typography ───────────────────────────────────────────── */
    .lp-sol-p {
        font-size: 15px;
        color: var(--app-text-2);
        line-height: 1.72;
        margin: 0 0 18px;
    }
    .lp-sol-section-title {
        font-size: 17px;
        font-weight: 700;
        color: var(--app-text);
        margin: 32px 0 12px;
        letter-spacing: -0.2px;
    }
    .lp-sol-callout {
        background: #f6f5ff;
        border: 1px solid #e2defd;
        border-radius: 10px;
        padding: 14px 18px;
        font-size: 14px;
        color: var(--app-violet-2);
        line-height: 1.6;
        margin: 20px 0;
    }
    .lp-sol-callout strong { color: var(--app-violet-2); }
    .lp-sol-link {
        color: var(--app-violet-1);
        text-decoration: underline;
    }
    .lp-sol-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 24px;
        font-size: 14px;
    }
    .lp-sol-table th {
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--app-text-muted);
        padding: 0 12px 10px 0;
        border-bottom: 1px solid var(--app-border);
    }
    .lp-sol-table td {
        padding: 11px 12px 11px 0;
        color: var(--app-text-2);
        border-bottom: 1px solid var(--app-border-light);
        vertical-align: middle;
    }
    .lp-sol-table tr:last-child td { border-bottom: none; }
    .lp-sol-table code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 12px;
        background: #f0f0f8;
        border: 1px solid var(--app-border-light);
        border-radius: 4px;
        padding: 2px 5px;
        color: var(--app-violet-2);
    }

    /* ── Feature block ────────────────────────────────────────────────── */
    .lp-sol-features {
        margin-top: 32px;
        padding: 24px;
        background: #ffffff;
        border: 1px solid var(--app-border-light);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .lp-sol-features-title {
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--app-violet-1);
        margin: 0 0 14px;
    }
    .lp-sol-feature-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 9px;
    }
    .lp-sol-feature-list li {
        font-size: 14px;
        color: var(--app-text-2);
        padding-left: 20px;
        position: relative;
        line-height: 1.5;
    }
    .lp-sol-feature-list li::before {
        content: "✓";
        position: absolute;
        left: 0;
        color: var(--app-violet-1);
        font-weight: 700;
    }

`;

