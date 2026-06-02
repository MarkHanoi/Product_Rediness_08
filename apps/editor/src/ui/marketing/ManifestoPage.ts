/**
 * ManifestoPage (marketing) — native editor L7 route for /manifesto.
 *
 * Replaces apps/docs-site/src/pages/manifesto.astro per ADR-055 §7.
 * Content is the §1-§5 manifesto narrative transferred verbatim from
 * the Astro source. The canonical record remains
 * docs/01-strategy/manifesto.md — this page is the customer-facing
 * surface, not the source.
 *
 * Contract compliance:
 *   §05 §5    — CSS in marketingPageStyles.ts (mkt- prefix); injected
 *               through injectAppTheme().
 *   §06 §3    — Implements dispose() for full cleanup.
 *   C43       — All colour resolves through DESIGN_TOKENS; no hardcoded
 *               hex literals beyond what LANDING_PAGE_STYLES already uses.
 *
 * Class prefix: mkt-  (shared with PricingPage + TrustPage)
 */

import { injectAppTheme } from '../styles/AppTheme';
import {
    buildNavHtml,
    wireNav,
    type MarketingPageCallbacks,
} from './PricingPage';

export class ManifestoPage {
    private root: HTMLElement;
    private el: HTMLElement;

    constructor(root: HTMLElement, private callbacks: MarketingPageCallbacks) {
        this.root = root;
        injectAppTheme();
        this.el = this.build();
        this.root.appendChild(this.el);
    }

    private build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'mkt-page';
        el.setAttribute('data-mkt-page', 'manifesto');
        el.innerHTML = `
            ${buildNavHtml('manifesto', this.callbacks)}
            <div class="mkt-body">
                <div class="mkt-content mkt-content--narrow">
                    <h1 class="mkt-hero-title">Buildings are made of light. Of habit. Of weather. Of money. Of compromise.</h1>
                    <p class="mkt-hero-lede">The software that builds them treats them as geometry.</p>

                    <p class="mkt-p">
                        For thirty years the industry's answer to "how does an architect
                        design a building?" has been a CAD command line in a 3D viewport.
                        Walls are line segments. Doors are stretched holes. Rooms are
                        derived polygons. The intent &mdash; the bedroom that needs a south
                        window, the kitchen that needs a triangle, the corridor that
                        must reach every room, the apartment a family will actually live
                        in &mdash; sits in the architect's head and never enters the model.
                    </p>
                    <p class="mkt-p">
                        PRYZM exists to fix this. We are building the first design
                        platform where the model knows what it is and the conversation
                        is the interface.
                    </p>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">The promise</h2>
                        <p class="mkt-promise">One conversation, from raw site to coordinated building.</p>
                        <p class="mkt-p">
                            That is the only promise. Everything else &mdash; the renderer, the
                            file format, the constraint database, the marketplace, the
                            sovereignty model, the WCAG audit &mdash; is in service of that
                            single line. When we ship a feature, we ask: does this make
                            the single-conversation promise more true, less true, or the
                            same? Features that don't move the needle don't ship.
                        </p>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">Why now</h2>
                        <p class="mkt-p">
                            Three things became possible between 2023 and 2026:
                        </p>
                        <table class="mkt-table">
                            <thead>
                                <tr>
                                    <th>Capability</th>
                                    <th>What changed</th>
                                    <th>Why it matters</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><span class="mkt-feature-name">LLMs with spatial reasoning</span></td>
                                    <td>Modern frontier models handle "make the master bedroom face south and put the bathroom between it and the kids' room" as a coherent instruction.</td>
                                    <td>The brief becomes the input. The model becomes the output. The middle is the platform.</td>
                                </tr>
                                <tr>
                                    <td><span class="mkt-feature-name">Browser-native 3D at desktop performance</span></td>
                                    <td>WebGL2 &rarr; WebGPU; offscreen canvas; 60 fps rendering of 10 k+ elements in Chrome / Safari / Firefox without an installer.</td>
                                    <td>A BIM tool can finally run where the architect actually works &mdash; the browser. Not Windows-only. Not 18 GB downloads. Not per-seat licence dongles.</td>
                                </tr>
                                <tr>
                                    <td><span class="mkt-feature-name">CRDT collaboration at design-tool fidelity</span></td>
                                    <td>Yjs + Automerge are mature enough to hold a BIM scene with hundreds of concurrent edits; explicit-conflict semantics are solved.</td>
                                    <td>Architects working with consultants, clients, and contractors in the same model &mdash; not in a chain of WeTransfer'd IFCs.</td>
                                </tr>
                            </tbody>
                        </table>
                        <p class="mkt-p">
                            We are not early. We are not late. The wave is breaking. The
                            window is open and will not stay open.
                        </p>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">Who we are</h2>
                        <p class="mkt-p">
                            We are not a Revit replacement vendor. We are not a generative
                            AI demo. We are not an image generator with rectangles on top.
                        </p>
                        <p class="mkt-p">
                            <strong>We are building a design-intelligence platform for the built environment.</strong>
                            Every word matters.
                        </p>
                        <ul class="mkt-list">
                            <li><strong>Design</strong> &mdash; not analysis, not visualisation, not documentation. The act of deciding what a building should be.</li>
                            <li><strong>Intelligence</strong> &mdash; the platform carries spatial, environmental, regulatory, and programmatic knowledge. It is not a passive editor.</li>
                            <li><strong>Platform</strong> &mdash; not a tool. Plugin authors, family creators, pricing-catalogue vendors, and AI-workflow developers extend it. The marketplace is a first-class surface.</li>
                            <li><strong>Built environment</strong> &mdash; buildings, but also rooms, neighbourhoods, sites, climates. We do not stop at the building envelope.</li>
                        </ul>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">How we talk to customers</h2>
                        <p class="mkt-p">Three sentences:</p>
                        <p class="mkt-promise">Aspirational about the result. Plain-spoken about the work. Curated about what we ship.</p>

                        <h3 class="mkt-section-sub">Aspirational about the result</h3>
                        <p class="mkt-p">
                            The villa-rental ad does not say "47 affordable holiday properties available."
                            It says <strong>"Stay where the light is different."</strong> That is the result, not the inventory.
                        </p>

                        <h3 class="mkt-section-sub">Plain-spoken about the work</h3>
                        <p class="mkt-p">
                            We do not promise magic. We do not claim our AI "understands buildings" &mdash;
                            we claim our AI <strong>routes a prompt through a 248-rule constraint
                            database to produce a layout the architect refines</strong>. Specifics are
                            the credibility.
                        </p>

                        <h3 class="mkt-section-sub">Curated about what we ship</h3>
                        <p class="mkt-p">
                            Every capability listed in product is shipped, measured, and supported.
                            The roadmap is internal. The track record is external.
                        </p>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">What we will not be</h2>
                        <ul class="mkt-list">
                            <li><strong>A Revit clone.</strong> Revit exists. PRYZM is not a price-undercutting alternative; it is a different category of product.</li>
                            <li><strong>The AI hype company.</strong> AI is a technique we use, not a product we sell. We do not put "AI" in the company name. We do not name features after model versions.</li>
                            <li><strong>A shovel-ware vendor.</strong> PRYZM is for the <em>design</em> phase, where decisions are made. Construction-administration, facilities-management, asset-tracking &mdash; important markets, but adjacencies, not the core.</li>
                            <li><strong>A closed format.</strong> <code>.pryzm</code> is open. IFC round-trip is real. No lock-in. Customers can leave with their data, and that fact alone constrains what we can do with the format forever.</li>
                        </ul>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">The shape of the company</h2>
                        <p class="mkt-p">Three structural commitments:</p>
                        <ul class="mkt-list">
                            <li><strong>Engineering-led, design-tasted.</strong> One team that holds the whole shape &mdash; no product-team-hands-spec-to-engineering-team pipeline.</li>
                            <li><strong>Open by default, paid by tier.</strong> Every customer-facing capability is documented publicly. The file format is open. The plugin SDK is open. We trade the moat of secrecy for the moat of momentum.</li>
                            <li><strong>Long-arc, not VC-financialised.</strong> We are building a 10-year company. Our north-star metric is net revenue retention of architects with &gt; 12-month tenure.</li>
                        </ul>
                    </section>

                    <footer class="mkt-footer">
                        Source of truth: <code>docs/01-strategy/manifesto.md</code> ·
                        Every word here traces back there.
                    </footer>
                </div>
            </div>
        `;
        wireNav(el, this.callbacks);
        return el;
    }

    dispose(): void {
        this.el.remove();
    }
}

export function mountManifestoPage(
    root: HTMLElement,
    callbacks: MarketingPageCallbacks,
): { dispose(): void } {
    const page = new ManifestoPage(root, callbacks);
    return { dispose: () => page.dispose() };
}
