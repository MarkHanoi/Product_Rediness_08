/**
 * TrustPage (marketing) — native editor L7 route for /trust.
 *
 * Replaces apps/docs-site/src/pages/trust.astro per ADR-055 §7.
 * Customer-facing surface of contracts C22 (Privacy), C23 (Provenance),
 * C39 (Pricing), C43 (Accessibility), C48 (Backup & DR).
 *
 * Tier display names come from `@pryzm/entitlements`'s
 * `buildPricingPageData()` so the retention table never drifts from the
 * pricing page's tier vocabulary — both pages share one source of truth.
 *
 * Contract compliance:
 *   §05 §5    — CSS in marketingPageStyles.ts (mkt- prefix); injected
 *               through injectAppTheme().
 *   §06 §3    — Implements dispose() for full cleanup.
 *   C43       — All colour resolves through DESIGN_TOKENS.
 */

import { injectAppTheme } from '../styles/AppTheme';
import { buildPricingPageData } from '@pryzm/entitlements';
import type { PlanTier } from '@pryzm/schemas';
import {
    buildNavHtml,
    wireNav,
    type MarketingPageCallbacks,
} from './PricingPage';

export class TrustPage {
    private root: HTMLElement;
    private el: HTMLElement;
    private readonly tierDisplayNames: Readonly<Record<PlanTier, string>>;

    constructor(root: HTMLElement, private callbacks: MarketingPageCallbacks) {
        this.root = root;
        injectAppTheme();
        // Share the tier vocabulary with the pricing page so the retention
        // bullet list never drifts from the entitlement registry.
        this.tierDisplayNames = buildPricingPageData().tierDisplayNames;
        this.el = this.build();
        this.root.appendChild(this.el);
    }

    private build(): HTMLElement {
        const t = this.tierDisplayNames;
        const el = document.createElement('div');
        el.className = 'mkt-page';
        el.setAttribute('data-mkt-page', 'trust');
        el.innerHTML = `
            ${buildNavHtml('trust', this.callbacks)}
            <div class="mkt-body">
                <div class="mkt-content">
                    <h1 class="mkt-hero-title">What we promise. How we deliver. What you can audit.</h1>
                    <p class="mkt-hero-lede">
                        Every promise on this page is anchored to a public contract in
                        the PRYZM repository. The contracts are the source of truth;
                        this page is the customer-readable summary.
                    </p>

                    <div class="mkt-pillar-grid">
                        <div class="mkt-pillar">
                            <h3 class="mkt-pillar-title">Privacy</h3>
                            <p class="mkt-pillar-body">Your PII stays in your region. Your project data stays where you put it. You can delete everything in 30 days.</p>
                            <div class="mkt-pillar-contract">C22 — Privacy &amp; PII Tier</div>
                        </div>
                        <div class="mkt-pillar">
                            <h3 class="mkt-pillar-title">Provenance</h3>
                            <p class="mkt-pillar-body">Every AI call is recorded with the model, the prompt hash, the cost, the approval state. You can audit any element back to its origin.</p>
                            <div class="mkt-pillar-contract">C23 — Provenance &amp; AI Audit</div>
                        </div>
                        <div class="mkt-pillar">
                            <h3 class="mkt-pillar-title">Accessibility</h3>
                            <p class="mkt-pillar-body">WCAG 2.2 AA across every shipped surface. AAA on text-dense surfaces. Keyboard-complete for every editor tool.</p>
                            <div class="mkt-pillar-contract">C43 — Accessibility</div>
                        </div>
                        <div class="mkt-pillar">
                            <h3 class="mkt-pillar-title">Recovery</h3>
                            <p class="mkt-pillar-body">Per-tier backups. Cross-region failover. Runbooks for every failure mode. Drill cadence stamped on the trust page.</p>
                            <div class="mkt-pillar-contract">C48 — Backup &amp; DR</div>
                        </div>
                    </div>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">Your data</h2>
                        <p class="mkt-p">
                            We classify every byte in four tiers. Different tiers live in
                            different storage with different controls:
                        </p>
                        <table class="mkt-table">
                            <thead>
                                <tr>
                                    <th>Tier</th>
                                    <th>What it is</th>
                                    <th>Where it lives</th>
                                    <th>Who can read it</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><span class="mkt-feature-name">PII</span></td>
                                    <td>Your email, name, billing address, IP, payment refs</td>
                                    <td>Region-locked (EU / US / AP per your choice); platform-key encrypted</td>
                                    <td>You · DSAR worker · privacy team (audited)</td>
                                </tr>
                                <tr>
                                    <td><span class="mkt-feature-name">Project</span></td>
                                    <td>Geometry, element properties, comments, AI artefacts</td>
                                    <td>Region-locked; BYOK available (Mid-Firm+)</td>
                                    <td>You + collaborators you invited</td>
                                </tr>
                                <tr>
                                    <td><span class="mkt-feature-name">Telemetry</span></td>
                                    <td>Anonymised usage metrics + perf timing</td>
                                    <td>Cross-region aggregation OK; never receives raw PII</td>
                                    <td>PRYZM engineering (aggregate only)</td>
                                </tr>
                                <tr>
                                    <td><span class="mkt-feature-name">Derived</span></td>
                                    <td>Generated layouts, exports, summaries inheriting PROJECT data</td>
                                    <td>Inherits PROJECT region</td>
                                    <td>You + collaborators you invited</td>
                                </tr>
                            </tbody>
                        </table>
                        <p class="mkt-p">
                            You can ask for an export of every PII + PROJECT row tied to
                            you. We deliver within 30 days. You can ask for erasure; we
                            purge within 30 days plus 90 days of cold-backup TTL.
                        </p>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">Your AI calls</h2>
                        <p class="mkt-p">
                            PRYZM uses AI to propose apartment layouts, critique plans,
                            and answer queries. Every model call is audited:
                        </p>
                        <ul class="mkt-list">
                            <li><span class="mkt-check">✓</span> Model name + version recorded (no aliases)</li>
                            <li><span class="mkt-check">✓</span> Prompt SHA recorded; redacted preview stored (first 1 KB only)</li>
                            <li><span class="mkt-check">✓</span> Cost in USD recorded per call</li>
                            <li><span class="mkt-check">✓</span> Approval state tracked: <em>auto-applied</em>, <em>user-approved</em>, <em>user-rejected</em>, <em>pending</em>, <em>never-applied</em></li>
                            <li><span class="mkt-check">✓</span> Reproducibility flag: deterministic (with seed) for our offline engines; non-deterministic for relay-based calls</li>
                            <li><span class="mkt-check">✓</span> Element-id graph: every element produced by an AI call links back to the artefact that proposed it</li>
                        </ul>
                        <p class="mkt-p">
                            Inside the editor, right-click any AI-generated element &rarr;
                            <strong>Show AI provenance</strong> &rarr; the audit row appears.
                            For regulators, request a signed Ed25519 export bundle.
                        </p>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">Your access</h2>
                        <p class="mkt-p">
                            Everything we ship meets WCAG 2.2 AA. Text-dense surfaces
                            (Inspect tree, Data panel) target AAA. Every editor tool has
                            a keyboard shortcut documented in the in-product cheat-sheet
                            (press <kbd>?</kbd>).
                        </p>
                        <ul class="mkt-list">
                            <li>Static contrast audit runs on every PR &mdash; zero failing token pairs to merge</li>
                            <li>Live axe-core gate scheduled per accessibility roadmap</li>
                            <li>Screen-reader announce service for every aria-live region (no raw <code>aria-live</code> attributes)</li>
                            <li>Focus indicators meet 3:1 contrast minimum; the platform's focus ring is its own audited token</li>
                        </ul>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">Your recovery</h2>
                        <p class="mkt-p">Things go wrong. We've written down what we do when they do:</p>
                        <table class="mkt-table">
                            <thead>
                                <tr>
                                    <th>Failure mode</th>
                                    <th>Recovery target</th>
                                    <th>Runbook</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td>Database primary failure</td><td>30-minute RTO</td><td>Promote read-replica &rarr; reconnect &rarr; verify</td></tr>
                                <tr><td>Regional outage</td><td>4-hour RTO</td><td>Cross-region failover with cold-backup fallback</td></tr>
                                <tr><td>Ransomware</td><td>24-hour RTO</td><td>Quarantine-first &rarr; credential rotation &rarr; mandatory disclosure</td></tr>
                                <tr><td>Accidental deletion</td><td>Tier-keyed (see below)</td><td>Per-tier retention window &rarr; in-place restore</td></tr>
                            </tbody>
                        </table>
                        <p class="mkt-p">Per-tier retention windows scale with your plan:</p>
                        <ul class="mkt-list" data-mkt-retention>
                            <li><strong>${escape(t['free-trial'])}</strong> · 7 days · best-effort restore</li>
                            <li><strong>${escape(t.solo)}</strong> · 30 days · self-service restore in app</li>
                            <li><strong>${escape(t.studio)}</strong> · 90 days · self-service + on-call support</li>
                            <li><strong>${escape(t['mid-firm'])}</strong> · 365 days · self-service + on-call + audit trail</li>
                            <li><strong>${escape(t.enterprise)}</strong> · custom · per-contract</li>
                        </ul>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">What's verifiable today vs in flight</h2>
                        <p class="mkt-p">
                            We do not have a "Coming Soon" page. But we do tell the truth
                            about what's ratified vs still in production-readiness work:
                        </p>
                        <table class="mkt-table">
                            <thead>
                                <tr><th>Promise</th><th>State</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>WCAG 2.2 AA contrast on every shipped token pair</td><td><span class="mkt-check">✓</span> Live · runs on every PR</td></tr>
                                <tr><td>AI provenance recorded for every model call</td><td><span class="mkt-check">✓</span> Live · backend complete · Inspect-tree right-click UI rolling out</td></tr>
                                <tr><td>DR runbooks for the 4 core failure modes</td><td><span class="mkt-check">✓</span> Authored · first live drill in flight</td></tr>
                                <tr><td>DSAR export within 30 days</td><td>Schemas + commands ratified · server worker in flight</td></tr>
                                <tr><td>Region-locked PII storage</td><td>In flight · launching with first paying customer in target region</td></tr>
                                <tr><td>BYOK customer-managed encryption</td><td>Contract ratified · implementation queued for Mid-Firm GA</td></tr>
                            </tbody>
                        </table>
                    </section>

                    <section class="mkt-section">
                        <h2 class="mkt-section-title">The contracts</h2>
                        <p class="mkt-p">
                            Every promise above is anchored to a contract. The contracts
                            live in the PRYZM repo and are public:
                        </p>
                        <ul class="mkt-list">
                            <li><strong>C22</strong> Privacy &amp; PII Tier &mdash; data classification, region routing, DSAR, breach reporting</li>
                            <li><strong>C23</strong> Provenance &amp; AI Audit &mdash; every AI call writes an artefact before returning; cycle-free DAG of elements &harr; artefacts</li>
                            <li><strong>C39</strong> Pricing &amp; Plan Tiers &mdash; every feature gate; pricing page is generated from the registry, never hand-edited</li>
                            <li><strong>C43</strong> Accessibility &mdash; WCAG 2.2 AA target with AAA elevations; per-surface keyboard surface; reduced-motion respected</li>
                            <li><strong>C48</strong> Backup &amp; Disaster Recovery &mdash; per-tier retention; cross-region failover; drill cadence; runbook discipline</li>
                        </ul>
                    </section>

                    <footer class="mkt-footer">
                        Sources of truth: <code>docs/02-decisions/contracts/C22</code>,
                        <code>C23</code>, <code>C39</code>, <code>C43</code>, <code>C48</code>.
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

export function mountTrustPage(
    root: HTMLElement,
    callbacks: MarketingPageCallbacks,
): { dispose(): void } {
    const page = new TrustPage(root, callbacks);
    return { dispose: () => page.dispose() };
}

/** Minimal HTML-escape — same shape as PricingPage's local helper. */
function escape(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
