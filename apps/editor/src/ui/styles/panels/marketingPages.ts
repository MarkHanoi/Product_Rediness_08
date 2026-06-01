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

    /* ─── Navbar — very translucent glass (20% white) so gradient is
       fully visible and the blobs drift through the bar as they move.
       blur(18px) keeps text legible against the animated colours.
    ────────────────────────────────────────────────────────────────── */
    .lp-nav {
        display: none;
    }
    /* ── Temporary bottom bar (nav moved here for layout testing) ── */
    .lp-bottom-bar {
        display: flex;
        align-items: center;
        padding: 0 28px;
        height: 56px;
        background: rgba(255,255,255,0.20);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-top: 1px solid rgba(196,181,253,0.18);
        gap: 20px;
        flex-shrink: 0;
    }
    .lp-bottom-bar-links {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
    }
    .lp-bottom-bar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }
    .lp-nav-brand {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-shrink: 0;
        text-decoration: none;
        cursor: pointer;
        margin-right: 4px;
        min-width: 151px;
        color: #050508;
    }
    .lp-logo-icon {
        width: 48px;
        height: 48px;
        display: block;
        filter: drop-shadow(0 1px 6px rgba(80,20,180,0.22));
        flex-shrink: 0;
        overflow: visible;
    }
    .lp-logo-wordmark {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex-shrink: 0;
    }
    .lp-logo-name {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 4px;
        color: #150830;
        line-height: 1;
    }
    .lp-logo-sub {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        font-size: 7.5px;
        font-weight: 400;
        letter-spacing: 4.5px;
        color: #9ca3af;
        text-transform: uppercase;
        line-height: 1;
    }
    .lp-nav-links {
        display: flex;
        gap: 4px;
        flex: 1;
    }
    .lp-nav-link {
        font-size: 14px;
        color: #1a1a1a;
        text-decoration: none;
        font-weight: 500;
        padding: 6px 10px;
        border-radius: 6px;
        transition: background 0.12s;
        display: flex;
        align-items: center;
        gap: 3px;
    }
    .lp-nav-link:hover { background: #f5f5f5; }
    .lp-nav-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }
    .lp-nav-login {
        background: none;
        border: none;
        font-size: 14px;
        font-weight: 500;
        color: #1a1a1a;
        cursor: pointer;
        padding: 7px 12px;
        border-radius: 999px;
        font-family: var(--app-font);
        transition: background 0.12s;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
    }
    .lp-nav-login:hover { background: rgba(0,0,0,0.06); }
    .lp-nav-contact {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255,255,255,0.18);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.28);
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
        transition: background 0.18s, transform 0.18s;
    }
    .lp-nav-contact:hover { background: rgba(255,255,255,0.30); transform: translateY(-1px); }
    .lp-nav-cta {
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
        transition: background 0.18s, transform 0.18s;
    }
    .lp-nav-cta:hover { background: rgba(0,0,0,0.42); transform: translateY(-1px); }

    /* ─── Hero — PRYZM4 full-screen centred layout ────────────────────── */
    .lp-hero {
        flex: 1;
        min-height: calc(100vh - 64px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 72px 24px 96px;
        text-align: center;
        position: relative;
    }

    /* ─── Hero logo block — CSS 3-D rotating spinner (same as EngineLoadingOverlay) ──── */
    .lp-hero-logo-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        margin-bottom: 16px;
        /* Reserve space for the scaled spinner so layout doesn't shift */
        min-height: 112px;
        justify-content: center;
    }
    /* Scale the lg spinner (44×56 px base) — 50% of original 2.8× hero size */
    .lp-hero-spinner {
        transform: scale(1.4);
        transform-origin: center center;
        overflow: visible;
        flex-shrink: 0;
    }
    /* logo-name is removed from DOM in PRYZM4 hero — kept as hidden no-op */
    .lp-hero-logo-name { display: none; }

    /* ─── Hero heading — "PRYZM" as the monumental wordmark ─────────────
       Typography matched to brand reference image:
         · Tight letter-spacing (-0.01em) — no artificial spread
         · 900 weight grotesque (Inter / system-ui), same as the reference
         · Smaller scale — clamp 56px → 112px (≈ half of previous 220px)
       White-to-lavender gradient fill gives the "white with a light shade"
       look the user asked for. drop-shadow provides legibility against the
       light pastel background and adds depth / innovative feel.
    ────────────────────────────────────────────────────────────────── */
    .lp-hero-heading {
        font-size: clamp(72px, 9.8vw, 146px);
        font-weight: 800;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.0;
        color: #ffffff;
        text-shadow: 0 2px 24px rgba(90,30,200,0.22), 0 1px 4px rgba(60,20,150,0.14);
        margin: 0 0 16px;
        letter-spacing: -0.03em;
        max-width: none;
        text-transform: uppercase;
    }

    /* ─── Hero subtitle — "Build the future, intelligently." ────────────
       Moved from the h1 position; slightly larger than the old subtitle.
    ────────────────────────────────────────────────────────────────── */
    .lp-hero-sub {
        font-size: clamp(13px, 1.3vw, 17px);
        color: rgba(255,255,255,0.88);
        line-height: 1.5;
        margin: 0 0 40px;
        max-width: 480px;
        font-weight: 400;
        letter-spacing: 0.01em;
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

    /* Staggered entrance on hero elements */
    .lp-hero-heading {
        animation: lp-ama-fadein 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
        animation-delay: 0.05s;
    }
    .lp-hero-sub {
        animation: lp-ama-fadein 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        animation-delay: 0.35s;
    }

    /* ─── Hero CTA row — offset slightly right per design ───────────── */
    .lp-hero-ctas {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        margin-bottom: 44px;
        transform: translateX(52px);
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
        .lp-hero-heading, .lp-hero-sub, .lp-hero-btn--enter { animation: none; }
        .lp-hero-ctas { transform: translateX(52px); }
    }

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
        color: #1a1a1a;
        flex-shrink: 0;
        transition: background 0.12s;
        margin-left: auto;
    }
    .lp-hamburger:hover { background: #f5f5f5; }
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
        /* Navbar: compact */
        .lp-nav {
            height: 60px;
            padding: 0 16px;
            position: relative;
        }
        /* Hide desktop nav links and action buttons */
        .lp-nav-links { display: none; }
        .lp-nav-actions { display: none; }
        /* Show hamburger */
        .lp-hamburger { display: flex; }
        /* Show mobile drawer */
        .lp-mobile-drawer { display: flex; }

        /* Scale down logo */
        .lp-logo-icon { width: 36px; height: 36px; }
        .lp-logo-name { font-size: 16px; letter-spacing: 3px; }
        .lp-logo-sub { font-size: 6.5px; letter-spacing: 3.5px; }
        .lp-nav-brand { gap: 10px; min-width: 0; }

        /* Hero: full-width, center card */
        .lp-hero {
            padding-left: 16px;
            padding-right: 16px;
            justify-content: center;
            min-height: calc(100vh - 60px);
        }
        .lp-hero-card {
            padding: 32px 24px 36px;
            max-width: 100%;
            width: 100%;
        }
        .lp-hero-heading {
            font-size: 44px;
            letter-spacing: -0.6px;
        }
        .lp-hero-sub {
            font-size: 13px;
            max-width: 100%;
        }

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
        .lp-hero-heading {
            font-size: 36px;
            letter-spacing: -0.4px;
        }
        .lp-hero-sub { font-size: 12px; }
        .lp-hero-btn {
            width: 100%;
            text-align: center;
            padding: 15px 28px;
        }
        .lp-bespoke { padding: 36px 12px; }
        .lp-bespoke-heading { font-size: 22px; }
    }
`;

