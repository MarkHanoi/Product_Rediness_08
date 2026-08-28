/**
 * landingMarkup — single source of truth for the PRYZM landing page's inner HTML.
 *
 * WHY THIS EXISTS (C51 §2.1.5 / tracker A.17.x.21)
 * ------------------------------------------------
 * The apex pre-render (`scripts/build/prerender-apex.mjs`) and the editor's
 * `LandingPage.ts` MUST emit byte-identical landing structure. Previously the
 * prerender HAND-WROTE a simplified landing, which drifted from the real
 * editor landing (missing Pricing/Solutions/Resources, different nav).
 * C51 §2.1.5 forbids exactly that hand-mirror drift. Both surfaces now
 * call this one function.
 *
 * HEADER TREATMENT (KRETZ-modelled, founder brief 2026-08-09)
 * -----------------------------------------------------------
 * Supersedes the motif.io treatment of 2026-08-07. The reference is a slim
 * real-estate landing bar: brand far left, nav links optically CENTRED in
 * the bar, small utilities far right. Per the founder pass of 2026-08-10 the
 * PRYZM tile mark LEADS the brand on the LEFT (it closed the row on the right in
 * the 08-09 pass, which read as a stray app icon). The reference bar is white;
 * PRYZM's is BRAND VIOLET (#6600FF), so every control inside it inverts to
 * white-on-violet. Immediately below the bar sits a full-bleed hero VIDEO
 * with the wordmark / headline / CTA floating in a glass panel over it —
 * the reference's floating search control, carrying PRYZM's copy.
 *
 * The previous treatment's structure is preserved exactly (same three bands,
 * same ids, same CTA order) so `LandingPage.ts`'s addEventListener wiring and
 * the `MarketingPages.test.ts` structural assertions still resolve.
 *
 * IMPORT PURITY (NON-NEGOTIABLE)
 * ------------------------------
 * This module has ZERO imports. It exports a plain string-builder only — no
 * THREE, no DOM, no @pryzm/core-app-model, no LandingPageMosaic, nothing with
 * side effects. That is what lets the apex prerender dynamic-import it via tsx
 * (the same way it imports the pure-CSS `marketingPages.ts`). See MEMORY.md
 * "SCC: no barrel access at module load" for why importing the LandingPage
 * CLASS would crash the prerender boot.
 *
 * TWO MODES
 * ---------
 *   mode:'app'   → the IDENTICAL markup the editor renders. Every id/class is
 *                  preserved so LandingPage's constructor wiring
 *                  (addEventListener on #lp-nav-login, #lp-hero-btn,
 *                  #lp-nav-demo, #lp-bespoke-contact, …) still resolves.
 *                  Interactive CTAs are <button id=…> with NO href.
 *                  The hamburger + drawer are emitted here ONLY — they are
 *                  JS-driven affordances and would be dead markup on apex.
 *   mode:'apex'  → same structure, but interactive CTAs become <a href>
 *                  anchors (there is no JS / no router on the apex). App
 *                  routes point at `${appOrigin}/<route>`; apex-owned content
 *                  routes are root-relative (`/pricing`, `/manifesto`, `/trust`).
 *
 * The mosaic container and the Solutions/Resources nav dropdowns are filled by
 * JS in the editor; on the apex they stay as the same empty <div> wrappers
 * (no script, so nothing mounts — which is fine for a static teaser).
 */

export interface LandingMarkupOptions {
    /** 'app' = editor (buttons + JS wiring); 'apex' = static prerender (anchors). */
    mode: 'app' | 'apex';
    /** App origin for apex CTAs, e.g. 'https://app.pryzm.so'. Required when mode==='apex'. */
    appOrigin?: string;
}

// The inline PRYZM pyramid SVG constant was DELETED 2026-08-10 with the centred
// hero glyph that was its only consumer (founder pass). The brand now appears once
// as the raster tile mark leading the nav — see NAV_MARK_URL. Keeping an unused
// constant "in case" is how dead code accumulates; git history holds it if needed.

/**
 * HERO COPY — the ONE place it exists. Both surfaces (apex prerender and the
 * in-app LandingPage) read these constants; nothing else may restate them.
 * (`index.html`'s first-paint skeleton is a third, pre-JS artifact that cannot
 * import TS — it MUST be hand-mirrored in lock-step, see its §SKEL-MATCH note.)
 */
/**
 * The small caps line ABOVE the headline (founder brief 2026-08-10, modelled on
 * the reference homepage's mission-date eyebrow). It is the PROPOSED release
 * date — provisional "for now" — so it lives as its own constant rather than
 * being spliced into the headline: changing a date must never mean re-cutting
 * copy in three files.
 */
export const HERO_DATELINE = 'SEPTEMBER 2027';
export const HERO_HEADLINE = 'DEVELOPMENT. COMPUTED.';
/**
 * The product name that opens the supporting line. Rendered as its own span so
 * it can carry more weight than the sentence it introduces without the string
 * being duplicated or the sentence being re-typed with a prefix baked in.
 */
export const HERO_SUBHEAD_BRAND = 'PRYZM DESIGN:';
export const HERO_SUBHEAD = 'Turning planning law into development intelligence.';

/** The showcase caption row, overlaid across the bottom of the product shot. */
export const SHOWCASE_CAPTIONS = [
    'Site intelligence',
    'Design',
    'Feasibility',
    'Cost',
    'Documentation',
    'Compliance',
] as const;

/* HERO_IMAGE_* constants DELETED 2026-08-10 (founder, rounds 6): the Paris
 * 3D-Site screenshot and its showcase section are REMOVED from the landing —
 * the stacked video sections carry the product story now. The caption
 * vocabulary (SHOWCASE_CAPTIONS above) survives as the video-section labels.
 * Git history holds the section + `/apex/hero-site-3d.webp` if ever needed. */

/**
 * NAV MARK — the PRYZM tile logo LEADING the header on the LEFT, beside the
 * wordmark. It is the ONLY brand image on the page (the centred hero glyph was
 * removed in the same 2026-08-10 pass).
 *
 * Source: docs/04-reference/images/Gemini_Generated_Image_bogd6hbogd6hbogd (1).png
 * (1024×1045, 1.8 MB). That file is NOT web-served — `docs/` is not a publicDir —
 * and shipping 1.8 MB for a 40 px mark would be indefensible, so it was CROPPED
 * to the tile (the pale surround alpha-matted away, giving clean rounded corners
 * over the violet bar) and re-encoded to 128×131 (~25 KB) at
 * `public/apex/pryzm-mark.png`. That path is Vite's publicDir, so the SAME file
 * serves the in-app landing at /apex/… and is copied into `dist-apex/apex/` by
 * `scripts/build/prerender-apex.mjs` for the apex (C51 §2.2.4 self-contained).
 */
// 2026-08-10 round 3 (founder): the TILE mark is replaced by a SEAMLESS header
// strip — the pyramid photographed directly on the violet field (source:
// public/apex/pryzm-mark-top-header.png, 1 MB), cropped to the pyramid region
// and re-encoded to a 992-BYTE webp at 2x. No tile, no border, no box: the
// strip's own gradient is masked out rightward into the bar's token gradient
// (the strip's seam colour #4A17A5 sits next to pryzm-purple-darker #4A00B7,
// which is what makes the melt invisible). The heavy source PNG is NOT shipped.
export const NAV_MARK_URL = '/apex/pryzm-mark-header.webp';
export const NAV_MARK_WIDTH = 178;
export const NAV_MARK_HEIGHT = 128;
export const NAV_MARK_ALT = 'PRYZM';

/**
 * HERO VIDEO — the full-bleed background of the hero section.
 *
 * TESTING ASSET (founder brief 2026-08-09): the founder-supplied hero (v2, ~31.5 MB — testing asset, compress before launch).
 * It is deliberately NOT part of the C51 §6.1.3 first-paint budget — see the
 * media carve-out in `scripts/check/check-apex-size.mjs` and the §6.1.3
 * amendment that ratifies it. It is `preload="metadata"`, so first paint costs
 * only the poster; the body streams afterwards.
 *
 * ⚠ AMENDED 2026-08-28 — this said *"a real first frame could not be extracted
 * (no ffmpeg in this toolchain), so it is a brand-violet field"*. An ffmpeg was
 * found on the machine, so the poster is now a REAL first frame of the hero:
 * 192px wide, 31 KB, upscaled by the browser as an LQIP. It still exists only to
 * stop the hero flashing black before the video paints, but it now previews the
 * actual opening shot instead of approximating it with a gradient.
 *
 * §HERO-2026-08-28 — the hero source is the founder's 2:16 product film,
 * transcoded from an 8K/60fps/HEVC master (738 MB, unplayable in most browsers)
 * to 1080p H.264 High @ ~2.3 Mbps, 30 fps, silent — **38 MB**. `+faststart` was
 * requested so playback can begin before the whole file lands; the atom order
 * was not independently re-verified here, so treat that as passed-to-ffmpeg
 * rather than measured. H.264 was chosen deliberately over keeping HEVC: HEVC
 * playback is uneven across browsers and a hero that silently fails to paint is
 * worse than one that is slightly larger.
 */
export const HERO_VIDEO_URL = '/apex/hero.mp4';

/**
 * §HERO-HEVC — the SAME film in HEVC, offered FIRST.
 *
 * At the byte budget Cloudflare Pages allows (25 MB/file, which for a 2:16 hero
 * fixes the average near 1.3 Mbps) H.264 cannot hold the linework in a section
 * drawing — hundreds of 1px lines smear into grey. HEVC at the same size holds
 * them: compared frame-for-frame at 0:56, the H.264 build loses individual lines
 * that the HEVC build keeps, and it carries 1920x1080 where H.264 needed 1600x900.
 *
 * ⚠ ORDER MATTERS AND IS THE WHOLE MECHANISM. The browser takes the FIRST
 * <source> whose `type` it can decode, so HEVC must be listed before the H.264
 * fallback. Anything that cannot decode `hvc1` — an older Chrome, a machine with
 * no hardware HEVC — silently falls through to the H.264 file. No JS is involved,
 * which matters here: the apex ships ZERO JavaScript (CSP `default-src 'none'`),
 * so a JS-based player or HLS is not available on this surface.
 *
 * The prior hero was ALSO HEVC, so this is a return to a proven-on-this-site
 * codec, not a new bet — the difference is that it now has an H.264 fallback
 * beneath it instead of being the only option.
 */
export const HERO_VIDEO_HEVC_URL = '/apex/hero-hevc.mp4';
export const HERO_VIDEO_POSTER_URL = '/apex/hero-poster.png';

/**
 * STACKED VIDEO SECTIONS — rounds 6 (founder brief 2026-08-10, SpaceX reference).
 *
 * The landing is now a sequence of FOUR full-viewport video sections the user
 * scrolls through: the hero above, then these three. Each carries a small
 * bottom-left caption block (eyebrow + label). The labels REUSE the existing
 * showcase caption vocabulary — they are minimal placeholders the founder can
 * edit, not new marketing copy.
 *
 * Filenames are case-EXACT as shipped in public/apex/ (the Fly/CF hosts are
 * case-sensitive): hero_02.mp4, hero_03.mp4, Hero_04.mp4.
 *
 * variant:
 *   'fade'  — the hero's MP4 ends on a WHITE frame; this section opens under a
 *             white gradient bridge so the outro melts into it (CSS-only,
 *             no scroll-jacking). Used for the section directly after the hero.
 *   'plain' — normal butt joint.
 *   'dark'  — the video is dark content; the section takes a HARD edge (no
 *             blend) and a near-black-violet fallback ground.
 */
/**
 * §HERO-ONLY (founder 2026-08-27) — *"just have one video on PRYZM at the top,
 * then remove the rest … the user should not be able to scroll down FOR NOW."*
 *
 * ⭐ ONE FLAG, TWO EFFECTS, FULLY REVERSIBLE. Flip this to `false` and the
 * landing returns EXACTLY to the four-section scroll it had before — nothing was
 * deleted. The stacked sections below, the bespoke block and every other section
 * remain in this file and in the markup builder; they are simply not emitted and
 * not reachable while this is on.
 *
 * That choice is deliberate: "for now" is a temporary editorial state, not a
 * decision to drop content. Deleting the sections would make the revert a
 * reconstruction job rather than a one-character edit.
 *
 * The scroll lock itself lives in `marketingPages.ts` (`.lp-shell`'s
 * `overflow-y`), because that is the element that actually scrolls — see the
 * §HERO-ONLY note beside it. Both halves cite this constant so neither can be
 * flipped alone and leave the page half-changed.
 */
export const LANDING_HERO_ONLY = true;

/**
 * §NAV-MAILTO — the ONE authority for the address every PRYZM contact CTA opens.
 *
 * Founder brief 2026-08-28, reported as urgent: "Book a demo" on the apex landed
 * on a surface still advertising `hello@pryzm.io`, an address that does not
 * receive mail. The CTA worked; the enquiries did not arrive. That is the worst
 * shape a defect can take on a marketing page — it looks like success.
 *
 * C84 EI-9 (one authority per concept): every contact point in the product now
 * reads THIS constant. It is deliberately exported so `PlatformRouter` (app-mode
 * `onContactSales`) and the apex prerender resolve the same string, rather than
 * each carrying its own copy — which is exactly how the dead address survived in
 * eight places at once.
 */
export const CONTACT_EMAIL = 'hellopryzm@gmail.com';
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/**
 * §NAV-MINIMAL — founder brief 2026-08-28: the landing bar carries only
 * Log in · Contact · Book a demo, plus "Start here" in the hero. Solutions,
 * Resources and Pricing are withheld from the UI until their pages are ready to
 * be read by a stranger.
 *
 * A FLAG, not a deletion, for the same reason as [LANDING_HERO_ONLY]: the pages,
 * their routes, their prerender and their styles all still exist and still build.
 * Flip this to `false` and the full nav returns with no other edit. Deleting the
 * markup would have made restoring it a rewrite.
 *
 * NB the wiring in `LandingPage.ts` optional-chains every id this hides. A `!`
 * assertion there would throw on mount the moment this flag went true, taking the
 * whole in-app landing page down — the trap §NAV-CTA-TRIM already documented.
 */
export const LANDING_MINIMAL_NAV = true;

const ALL_VIDEO_SECTIONS = [
    { src: '/apex/hero_02.mp4', label: SHOWCASE_CAPTIONS[0], variant: 'fade' },
    { src: '/apex/hero_03.mp4', label: SHOWCASE_CAPTIONS[1], variant: 'plain' },
    { src: '/apex/Hero_04.mp4', label: SHOWCASE_CAPTIONS[2], variant: 'dark' },
] as const;

export const VIDEO_SECTIONS: readonly (typeof ALL_VIDEO_SECTIONS)[number][] =
    LANDING_HERO_ONLY ? [] : ALL_VIDEO_SECTIONS;
/** The small caps line above each section label — the brand, reused, not new copy. */
export const VIDEO_SECTION_EYEBROW = 'PRYZM DESIGN';

/**
 * Returns the landing page's inner HTML (the contents of `.lp-shell`).
 *
 * In 'app' mode the caller (LandingPage.build) sets this as innerHTML on a
 * `<div class="lp-shell">` and then attaches its event listeners. In 'apex'
 * mode the prerender wraps it in `<div class="lp-shell">…</div>` as the body.
 */
export function landingMarkup(opts: LandingMarkupOptions): string {
    const apex = opts.mode === 'apex';
    const origin = (opts.appOrigin ?? '').replace(/\/+$/, '');

    // CTA helper — in app mode emit an interactive <button id> (NO href) so the
    // editor's addEventListener wiring drives it; in apex mode emit an <a href>
    // anchor (no JS) to the given URL. id/class are identical across modes.
    const cta = (
        id: string,
        cls: string,
        href: string,
        inner: string,
    ): string => {
        // Omit the class attribute entirely when empty — the editor's bespoke
        // CTAs are `<button id="lp-bespoke-contact">` with NO class attribute,
        // and we must reproduce that byte-for-byte in 'app' mode.
        const clsAttr = cls ? ` class="${cls}"` : '';
        return apex
            ? `<a${clsAttr} id="${id}" href="${href}">${inner}</a>`
            : `<button${clsAttr} id="${id}">${inner}</button>`;
    };

    // Apex CTA destinations (ignored in app mode, where buttons have no href).
    const SIGNUP = `${origin}/signup`;
    const SIGNIN = `${origin}/sign-in`;
    const SOLUTIONS = `${origin}/solutions`;
    const RESOURCES = `${origin}/resources`;
    // §NAV-MAILTO — "Contact" and "Book a demo" open the reader's own mail client
    // addressed to [CONTACT_EMAIL], instead of routing to the app-owned /contact
    // surface. They previously pointed at `${origin}/contact`, a page still
    // advertising a dead address.
    //
    // This STRENGTHENS C51 §2.2.1 rather than bending it. The clause forbids the
    // apex from OWNING an auth-adjacent sales surface; a mailto: owns nothing —
    // it is a protocol handoff to the user's own client. No apex route, no new
    // origin constant, no hardcoded host, and one fewer cross-domain hop before
    // the enquiry reaches a human.
    //
    // It also needs no CSP grant. The apex ships `default-src 'none'`, which
    // governs subresource FETCHES, not link navigations — so the zero-JS posture
    // is untouched and no `media-src`-style exception is required.
    // §EMAIL-OFF — the two mailto CTAs below are wrapped in Cloudflare's
    // `<!--email_off-->` opt-out, and they MUST stay wrapped.
    //
    // Cloudflare's Scrape Shield "Email Address Obfuscation" is ON for this zone.
    // It rewrites every mailto: it finds into `/cdn-cgi/l/email-protection#<hex>`
    // and injects `/cdn-cgi/scripts/…/email-decode.min.js` to undo it in the
    // browser. On a normal site that is invisible. On THIS one it is fatal: the
    // apex ships `default-src 'none'` with NO `script-src`, so the decoder is
    // blocked by our own CSP and the link resolves to a Cloudflare interstitial
    // instead of opening mail.
    //
    // Measured on the live apex before this wrapper existed: the served nav
    // carried `href="/cdn-cgi/l/email-protection#2048454c…"` and a
    // `<script src="…/email-decode.min.js">` the CSP forbids. The address was
    // correct and the link was dead — the SAME "fails by succeeding" shape as the
    // dead address this whole change exists to fix, reintroduced one layer down.
    // The zero-JS posture is the point of the apex, so the fix is to opt the
    // markup out, never to admit a script-src.
    const CONTACT = `${CONTACT_MAILTO}?subject=${encodeURIComponent('PRYZM enquiry')}`;
    const DEMO = `${CONTACT_MAILTO}?subject=${encodeURIComponent('PRYZM — book a demo')}`;

    return `
            <!-- ── Nav bar ──────────────────────────────────── -->
            <nav class="lp-nav${apex ? ' lp-nav--apex' : ''}">
                <!-- Founder brief 2026-08-10: the MARK leads on the LEFT, beside the
                     wordmark, and the descender under it is gone (the strapline below
                     the headline already says what PRYZM is, so repeating it in the bar
                     was noise). The mark is the only brand image in the nav — it used
                     to sit on the far right, which read as a stray app icon.
                     NB this comment ships in the rendered HTML, so it deliberately does
                     not quote the removed strings: MarketingPages.test.ts asserts the
                     page contains no trace of them. -->
                <div class="lp-nav-brand">
                    <img class="lp-nav-mark" src="${NAV_MARK_URL}" width="${NAV_MARK_WIDTH}" height="${NAV_MARK_HEIGHT}" alt="${NAV_MARK_ALT}" decoding="async">
                </div>
                <!-- §NAV-MINIMAL — Solutions / Resources / Pricing are withheld
                     from the bar behind LANDING_MINIMAL_NAV. The markup is kept
                     verbatim inside the false branch so restoring them is one
                     boolean, not a rewrite. In 'app' mode this also removes the
                     two dropdown MOUNT POINTS, which is why LandingPage.ts
                     already guards both with an if-present check.
                     NB no backticks in this comment: it lives INSIDE a template
                     literal, where one would terminate the string. -->
                <div class="lp-nav-links">${LANDING_MINIMAL_NAV ? '' : `
                    <div class="lp-sol-nav-wrapper" id="lp-sol-nav-wrapper">${apex ? `<a class="lp-nav-link" id="lp-nav-solutions" href="${SOLUTIONS}">Solutions</a>` : ''}</div>
                    <div class="lp-res-nav-wrapper" id="lp-res-nav-wrapper">${apex ? `<a class="lp-nav-link" id="lp-nav-resources" href="${RESOURCES}">Resources</a>` : ''}</div>
                    <a class="lp-nav-link" href="${apex ? '/pricing' : '#'}" id="lp-nav-pricing">Pricing</a>
                `}</div>
                <div class="lp-nav-actions">
                    <!-- Founder brief 2026-08-10 round 2: "Contact sales" and "Get
                         started for free" removed from the BAR. Log in + Book a demo
                         remain. Both routes stay reachable elsewhere (the hero CTA
                         goes to signup; the mobile drawer keeps all four) so no
                         journey is lost — only the bar is quieter. -->
                    <!-- §NAV-MINIMAL (2026-08-28) reinstates "Contact" in the bar,
                         partially reversing §NAV-CTA-TRIM below. With Solutions,
                         Resources and Pricing withheld, the bar was down to two
                         actions and a stranger had no way to reach a human that
                         did not read as a sales funnel. Contact sits BEFORE the
                         demo so the softer ask comes first and the emphasised
                         white pill stays last. -->
                    ${cta('lp-nav-login', 'lp-nav-login', SIGNIN, 'Log in')}
                    <!--email_off-->${cta('lp-nav-contact', 'lp-nav-contact', CONTACT, 'Contact')}<!--/email_off-->
                    <!--email_off-->${cta('lp-nav-demo', 'lp-nav-demo', DEMO, 'Book a demo')}<!--/email_off-->
                </div>
                ${apex ? '' : `<!-- ── Mobile hamburger (visible at ≤768px) ── -->
                <button class="lp-hamburger" id="lp-hamburger" aria-label="Open menu" aria-expanded="false">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="3" y1="6" x2="21" y2="6"/>
                        <line x1="3" y1="12" x2="21" y2="12"/>
                        <line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                </button>
                <!-- ── Mobile nav drawer ── -->
                <div class="lp-mobile-drawer" id="lp-mobile-drawer" aria-hidden="true">
                    ${LANDING_MINIMAL_NAV ? '' : `<div class="lp-mobile-drawer-links">
                        ${cta('lp-mob-solutions', 'lp-mobile-drawer-link', SOLUTIONS, 'Solutions')}
                        ${cta('lp-mob-resources', 'lp-mobile-drawer-link', RESOURCES, 'Resources')}
                        ${cta('lp-mob-pricing', 'lp-mobile-drawer-link', apex ? '/pricing' : '#', 'Pricing')}
                    </div>`}
                    <div class="lp-mobile-drawer-actions">
                        ${cta('lp-mob-demo', 'lp-mobile-drawer-demo', DEMO, 'Book a demo')}
                        ${cta('lp-mob-cta', 'lp-mobile-drawer-cta', SIGNUP, 'Get started for free')}
                        ${cta('lp-mob-login', 'lp-mobile-drawer-login', SIGNIN, 'Log in')}
                        ${cta('lp-mob-contact', 'lp-mobile-drawer-contact', CONTACT, 'Contact sales')}
                    </div>
                </div>`}
            </nav>

            <!-- ── Hero — full-bleed video with the copy anchored bottom-left ───
                 Founder brief 2026-08-10: restyled to the reference homepage's
                 hierarchy — small letter-spaced DATE line → strong (but no longer
                 viewport-filling) headline → supporting line → CTA, ragged left and
                 sat in the bottom-left corner of the frame. The glass panel is gone:
                 a bordered, blurred card is a *container*, and the reference reads
                 as type laid directly on film. Legibility is carried by the scrim
                 instead (see .lp-hero-media::after), which is now weighted toward
                 exactly the corner the copy occupies.

                 THE VIDEO IS DECORATIVE. aria-hidden on the media wrapper keeps
                 it out of the accessibility tree; it has no controls attribute,
                 so it is not in the tab order and cannot trap focus. tabindex=-1 states
                 that explicitly rather than relying on the default.

                 muted+playsinline are what make autoplay legal on iOS/Safari;
                 preload="metadata" keeps the 14 MB body off the first-paint
                 critical path; poster paints instantly so there is never a black
                 flash. prefers-reduced-motion is honoured in CSS by hiding the
                 <video> outright and leaving .lp-hero-media's brand-violet
                 gradient — the apex ships ZERO JS (CSP default-src 'none'), so a
                 CSS-only reduced-motion path is the only one available. -->
            <section class="lp-hero lp-hero--video">
                <div class="lp-hero-media" aria-hidden="true">
                    <video class="lp-hero-video" autoplay muted loop playsinline
                           preload="metadata" poster="${HERO_VIDEO_POSTER_URL}"
                           tabindex="-1" disablepictureinpicture>
                        <source src="${HERO_VIDEO_HEVC_URL}" type="video/mp4; codecs=hvc1">
                        <source src="${HERO_VIDEO_URL}" type="video/mp4">
                    </video>
                </div>

                <div class="lp-hero-panel">
                    <!-- Founder brief 2026-08-10: the centred pyramid glyph is REMOVED.
                         The mark now lives once, in the nav on the left; repeating it
                         over the video competed with the headline for the same focal
                         point. The 3-D spinner mount point goes with it — nothing else
                         referenced the block, and the apex ships no JS anyway.

                         The small caps line that used to sit here was the product name,
                         which now opens the supporting line below instead. Two small
                         letter-spaced lines stacked above one headline read as an
                         indecisive eyebrow; the reference has exactly one. -->
                    <p class="lp-hero-dateline">${HERO_DATELINE}</p>

                    <h1 class="lp-hero-heading">${HERO_HEADLINE}</h1>

                    <p class="lp-hero-sub"><span class="lp-hero-sub-brand">${HERO_SUBHEAD_BRAND}</span> ${HERO_SUBHEAD}</p>

                    <!-- CTA button — MIAW "ask me anything" glass-pill style, delayed entrance -->
                    <div class="lp-hero-ctas">
                        ${cta(
                            'lp-hero-btn',
                            'lp-hero-btn lp-hero-btn--enter',
                            SIGNUP,
                            `<svg width="14" height="18" viewBox="0 0 18 22" fill="none" aria-hidden="true" style="flex-shrink:0"><path d="M0 0L0 17.5L4.5 13L7.5 20L9.5 19.2L6.5 12H12L0 0Z" fill="currentColor"/></svg>
                            Start here`,
                        )}
                    </div>
                </div>
            </section>

            <!-- ── Stacked full-viewport video sections (rounds 6, SpaceX ref) ──
                 LOADING STRATEGY (founder brief §5): these three MUST NOT
                 autoplay-load eagerly — that would stream ~72 MB before the
                 user scrolls. Two modes:
                   app  — preload="none", NO autoplay. LandingPageVideoLazy.ts
                          (IntersectionObserver, same pattern as
                          LandingPageScrollReveal) calls .play() as a section
                          approaches the viewport and .pause() when it leaves.
                   apex — ships ZERO JS (CSP default-src 'none'), so the videos
                          carry autoplay + preload="none". HONEST LIMIT: with
                          autoplay the browser decides when to fetch; modern
                          engines defer/pause offscreen muted autoplay, but the
                          spec does not guarantee laziness without a script.
                 Videos are decorative: aria-hidden wrapper, no controls,
                 tabindex=-1, disablepictureinpicture — same ruling as the hero. -->
            ${VIDEO_SECTIONS.map((s) => `<section class="lp-vsec${s.variant === 'plain' ? '' : ` lp-vsec--${s.variant}`}" aria-label="${s.label}">
                <div class="lp-vsec-media" aria-hidden="true">
                    <video class="lp-vsec-video" ${apex ? 'autoplay ' : ''}muted loop playsinline
                           preload="none" tabindex="-1" disablepictureinpicture>
                        <source src="${s.src}" type="video/mp4">
                    </video>
                </div>
                <div class="lp-vsec-panel">
                    <p class="lp-vsec-eyebrow">${VIDEO_SECTION_EYEBROW}</p>
                    <h2 class="lp-vsec-title">${s.label}</h2>
                </div>
            </section>`).join('\n\n            ')}

            <!-- Product-showcase section (the Paris 3D-Site screenshot) REMOVED
                 2026-08-10 (founder, rounds 6) — the stacked video sections
                 above carry the product story now. -->

            <!-- ── Stream 2 — Bespoke / Enterprise section ─── -->
            <section class="lp-bespoke lp-reveal" id="lp-bespoke">
                <div class="lp-bespoke-inner">
                    <div class="lp-bespoke-col lp-bespoke-col--left">
                        <h2 class="lp-bespoke-heading">Building your own platform?</h2>
                        <p class="lp-bespoke-desc">AI is making software cheap to build. We partner with enterprises to deploy a bespoke BIM platform under their brand — custom element libraries, your workflows, your infrastructure.</p>
                        <div class="lp-bespoke-actions">
                            <!--email_off-->${cta('lp-bespoke-contact', '', CONTACT, 'Talk to us')}<!--/email_off-->
                            ${cta('lp-bespoke-learn', '', apex ? '/pricing' : '#', 'See enterprise options')}
                        </div>
                    </div>
                    <div class="lp-bespoke-col lp-bespoke-col--right">
                        <ul class="lp-bespoke-list">
                            <li>Custom element &amp; material libraries</li>
                            <li>Integration with Revit, ArchiCAD, and ERP systems</li>
                            <li>White-label under your brand</li>
                            <li>On-premise or private cloud deployment</li>
                            <li>Dedicated build team and ongoing support</li>
                        </ul>
                    </div>
                </div>
            </section>

        `;
}
