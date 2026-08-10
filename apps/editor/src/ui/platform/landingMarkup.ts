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

/**
 * HERO_IMAGE_URL — the full-bleed product screenshot beneath the hero.
 *
 * WHY IT SHIPS INSIDE THE APEX (C51 §2.2.4 / §6.1.3)
 * --------------------------------------------------
 * §2.2.4 permits an allowlisted image CDN, but that is a PERMISSION, not a
 * preference: an apex that serves its own hero has no cross-origin dependency,
 * needs no CSP widening, and cannot be broken by a third party's outage. The
 * asset is a 1600×442 WebP (~109 KB) — already compressed, so gzip is a no-op
 * on it — which lands the whole apex around 133 KB against the 200 KB gzipped
 * §6.1.3 ceiling. It is served from apps/editor/public/apex/, which
 * prerender-apex.mjs copies into dist-apex/ verbatim.
 *
 * WHEN EMPTY the hero degrades honestly: the section still renders at its
 * exact aspect ratio on a token-coloured surface with the caption row legible.
 * It never shows a broken-image icon and never collapses.
 */
export const HERO_IMAGE_URL = '/apex/hero-site-3d.webp';
/** Intrinsic size of the asset — drives aspect-ratio so there is ZERO CLS. */
export const HERO_IMAGE_WIDTH = 1600;
export const HERO_IMAGE_HEIGHT = 442;
export const HERO_IMAGE_ALT =
    'The PRYZM editor in 3D Site view over Paris: a glass massing tower placed among '
    + 'the existing city blocks with the Eiffel Tower behind it, the modelling tool rail '
    + 'on the left, and the 5D plan, 3D globe, 3D Site, Real, Massing and Fly-tour view '
    + 'controls across the top.';

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
export const NAV_MARK_URL = '/apex/pryzm-mark.png';
export const NAV_MARK_WIDTH = 128;
export const NAV_MARK_HEIGHT = 131;
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
 * The poster is a 64×36 LQIP the browser upscales — a real first frame could
 * not be extracted (no ffmpeg in this toolchain), so it is a brand-violet field
 * matching `.lp-hero-media`'s CSS gradient. Its only job is to make sure the
 * hero never flashes BLACK, and at 1.7 KB it does that for free.
 */
export const HERO_VIDEO_URL = '/apex/hero.mp4';
export const HERO_VIDEO_POSTER_URL = '/apex/hero-poster.png';

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
    const CONTACT = `${origin}/contact`;
    const SOLUTIONS = `${origin}/solutions`;
    const RESOURCES = `${origin}/resources`;
    // "Book a demo" is an auth-adjacent SALES surface. C51 §2.2.1 forbids the
    // apex from owning any such surface, so it reuses the SAME app-owned
    // /contact route (and the SAME appOrigin mechanism) as "Contact sales",
    // distinguished only by an intent query param the contact surface may
    // read or ignore. No new origin constant, no hardcoded host.
    const DEMO = `${CONTACT}?intent=demo`;

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
                <div class="lp-nav-links">
                    <div class="lp-sol-nav-wrapper" id="lp-sol-nav-wrapper">${apex ? `<a class="lp-nav-link" id="lp-nav-solutions" href="${SOLUTIONS}">Solutions</a>` : ''}</div>
                    <div class="lp-res-nav-wrapper" id="lp-res-nav-wrapper">${apex ? `<a class="lp-nav-link" id="lp-nav-resources" href="${RESOURCES}">Resources</a>` : ''}</div>
                    <a class="lp-nav-link" href="${apex ? '/pricing' : '#'}" id="lp-nav-pricing">Pricing</a>
                </div>
                <div class="lp-nav-actions">
                    <!-- Founder brief 2026-08-10 round 2: "Contact sales" and "Get
                         started for free" removed from the BAR. Log in + Book a demo
                         remain. Both routes stay reachable elsewhere (the hero CTA
                         goes to signup; the mobile drawer keeps all four) so no
                         journey is lost — only the bar is quieter. -->
                    ${cta('lp-nav-login', 'lp-nav-login', SIGNIN, 'Log in')}
                    ${cta('lp-nav-demo', 'lp-nav-demo', DEMO, 'Book a demo')}
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
                    <div class="lp-mobile-drawer-links">
                        ${cta('lp-mob-solutions', 'lp-mobile-drawer-link', SOLUTIONS, 'Solutions')}
                        ${cta('lp-mob-resources', 'lp-mobile-drawer-link', RESOURCES, 'Resources')}
                        ${cta('lp-mob-pricing', 'lp-mobile-drawer-link', apex ? '/pricing' : '#', 'Pricing')}
                    </div>
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

            <!-- ── Product showcase — full-bleed screenshot + caption row ───
                 The <img> is served from an allowlisted CDN (C51 §2.2.4) so the
                 200 KB gzipped apex budget (§6.1.3) is untouched. With no asset
                 configured the frame still occupies its exact aspect ratio on a
                 deep-purple token surface — honest, and zero CLS either way. -->
            <section class="lp-showcase" aria-label="The PRYZM editor">
                <figure class="lp-showcase-frame${HERO_IMAGE_URL ? '' : ' lp-showcase-frame--pending'}">
                    ${HERO_IMAGE_URL
                        ? `<img class="lp-showcase-img" src="${HERO_IMAGE_URL}" width="${HERO_IMAGE_WIDTH}" height="${HERO_IMAGE_HEIGHT}" alt="${HERO_IMAGE_ALT}" loading="lazy" decoding="async">`
                        : `<div class="lp-showcase-placeholder" role="img" aria-label="${HERO_IMAGE_ALT}"></div>`}
                    <figcaption class="lp-showcase-caption">
                        ${SHOWCASE_CAPTIONS.map((c) => `<span class="lp-showcase-caption-item">${c}</span>`).join('\n                        ')}
                    </figcaption>
                </figure>
            </section>

            <!-- ── Stream 2 — Bespoke / Enterprise section ─── -->
            <section class="lp-bespoke lp-reveal" id="lp-bespoke">
                <div class="lp-bespoke-inner">
                    <div class="lp-bespoke-col lp-bespoke-col--left">
                        <h2 class="lp-bespoke-heading">Building your own platform?</h2>
                        <p class="lp-bespoke-desc">AI is making software cheap to build. We partner with enterprises to deploy a bespoke BIM platform under their brand — custom element libraries, your workflows, your infrastructure.</p>
                        <div class="lp-bespoke-actions">
                            ${cta('lp-bespoke-contact', '', CONTACT, 'Talk to us')}
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
