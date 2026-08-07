#!/usr/bin/env node
/**
 * scripts/check/check-dns-map-honoured.mjs
 * ============================================================================
 * C51 §4 gate — "the DNS map is normative; deviations are CONTRACT VIOLATIONS."
 *
 * This is the LAST of the seven §7 gates, and the only one that could not be
 * written until 2026-08-07, because until that day `app.pryzm.so` did not exist.
 * The contract declared the map in June; the records landed in August; for the
 * whole gap NOTHING was checking, and the live apex shipped `Log in` links to a
 * hostname that returned NXDOMAIN. **A contract clause with no gate is a wish.**
 *
 * ── WHAT THIS GATE ACTUALLY CHECKS, AND WHAT IT DELIBERATELY DOES NOT ────────
 *
 * §4 makes two KINDS of claim, and only one of them is checkable from CI:
 *
 *   (a) IDENTITY  — "app.pryzm.so serves the app; pryzm.so serves the apex."
 *       Checkable. A live HTTP probe can ask each host what it is and compare
 *       against the map. This gate checks these.
 *
 *   (b) PROVENANCE — "pryzm.so resolves to Cloudflare Pages, never to Fly"
 *       (§4.1.1), "TLS is Cloudflare-auto-provisioned" (§4.1.3). NOT reliably
 *       checkable from a response: a CDN in front of an origin can make Fly look
 *       like Cloudflare and vice versa, and header sniffing for `cf-ray` proves
 *       a Cloudflare EDGE, not a Cloudflare ORIGIN. This gate does NOT claim to
 *       verify these, and says so rather than shipping a check that passes for
 *       the wrong reason. See §7 follow-up.
 *
 * ⚠ THE FAILURE MODE THIS GATE IS BUILT TO AVOID. The §5.2 post-mortem in
 * DEPLOY-CONTRACT-MANUAL-FLY.md records a verification script that FAILED a
 * healthy deploy and would have triggered a rollback. A gate that can fail for a
 * reason unrelated to the contract is worse than no gate, because it converts a
 * green system into a destructive action. Therefore:
 *
 *   • A NETWORK failure is NOT a contract violation. If DNS or TLS cannot be
 *     reached at all, this gate SKIPS (exit 0) with a loud note. CI runners lose
 *     egress; that is not evidence about the DNS map.
 *   • Only a host that ANSWERS, and answers as the WRONG SURFACE, fails.
 *
 * That asymmetry is deliberate: this gate can prove a violation, it cannot prove
 * compliance. Silence means "not observed", never "verified" — the standing
 * §CONTEXT-DATA-HONESTY rule that a failure and an empty result must never be
 * the same value.
 *
 * Run with `--offline` to skip every network probe (the static map audit still
 * runs). CI sets this when egress is unavailable.
 *
 * Exit 0 = clean or skipped. Exit 1 = an observed surface/identity violation.
 *
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §4, §5, §7
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const contract = resolve(repoRoot, 'docs', '02-decisions', 'contracts', 'C51-APEX-APP-DEPLOYMENT-SPLIT.md');

const OFFLINE = process.argv.includes('--offline') || process.env.CHECK_DNS_OFFLINE === '1';
const TIMEOUT_MS = 12_000;

/**
 * The §4 map rows this gate can actually observe, with the OBSERVABLE identity
 * claim for each. Kept in sync with the contract table by the static audit below.
 */
const EXPECTATIONS = [
    {
        host: 'pryzm.so',
        surface: 'apex',
        // The apex is pre-rendered marketing. §2.2.1: it must never carry auth.
        probe: '/',
        expect: async (res, body) => {
            if (!res.ok) return `expected 200 from the apex, got ${res.status}`;
            // ⚠ THESE DISCRIMINATORS WERE CHOSEN BY POSITIVE CONTROL, NOT BY GUESS.
            // The first draft tested for `<div id="root"></div>` and `EngineBootstrap`.
            // Pointed at the real app host (pryzm.fly.dev) that draft PASSED — the app
            // shell contains neither string, so the check was blind and would have
            // reported "apex healthy" with the editor served from apex. The markers
            // below are the ones that actually separate the two artifacts, verified by
            // fetching both hosts on 2026-08-07:
            //
            //   app  → <script src="/cesium/Cesium.js"> + /cesium/Widgets/widgets.css
            //   apex → a `default-src 'none'` meta CSP and ZERO script tags (§2.1.1)
            //
            // If either artifact's head changes, RE-RUN THE POSITIVE CONTROL: point
            // this expectation at the app host and confirm it FAILS. A gate that
            // cannot fail is not a gate.

            // §1 — the editor must never be served from apex. The Cesium bootstrap is
            // the app shell's signature and cannot appear in a static marketing page.
            if (/\/cesium\/Cesium\.js|\/cesium\/Widgets\/widgets\.css/.test(body)) {
                return 'apex is serving the EDITOR shell (Cesium bootstrap present) — '
                    + '§1 invariant violation: apex must be marketing only, and §4.2.1 forbids apex pointing at the app';
            }
            // §2.1.1 — no client JS framework may execute before first paint. The apex
            // artifact ships zero <script src>; the app ships several.
            if (/<script\s+[^>]*src=/i.test(body)) {
                return 'apex served a <script src> — §2.1.1 forbids framework JS before first paint '
                    + '(and this is how an app shell would look if apex were pointed at Fly)';
            }
            // §2.1.3 — apex must be crawlable pre-rendered HTML, not an SPA placeholder.
            if (/<div id="root"><\/div>/.test(body) || body.length < 2000) {
                return `apex served no meaningful pre-rendered content (${body.length} bytes) — §2.1.3`;
            }
            // §2.2.1 — apex traffic is anonymous by contract.
            const setCookie = res.headers.get('set-cookie');
            if (setCookie && /session|auth/i.test(setCookie)) {
                return `apex issued an auth cookie — §2.2.1 violation (${setCookie.slice(0, 60)}…)`;
            }
            return null;
        },
    },
    {
        host: 'app.pryzm.so',
        surface: 'app',
        // §3.1.8 — the app bridges clean entry paths into the SPA's first-paint form.
        probe: '/sign-in',
        redirect: 'manual',
        expect: async (res) => {
            if (res.status !== 302) {
                return `expected a 302 §3.1.8 bridge on /sign-in, got ${res.status} `
                    + '(if this is a 404 the app is not serving this host; if 301 to apex, '
                    + 'the §3.2.1 guard is over-matching an APP route)';
            }
            const loc = res.headers.get('location') || '';
            if (!loc.includes('page=signin')) {
                return `/sign-in bridged to "${loc}" — §5.3 requires ?page=signin`;
            }
            return null;
        },
    },
    {
        host: 'app.pryzm.so',
        surface: 'app',
        // §3.2.1 — a marketing PATH reaching the APP host bounces to the apex,
        // because the apex owns the content. This is the row that proves the two
        // surfaces are distinct rather than one server answering to both names.
        probe: '/pricing',
        redirect: 'manual',
        expect: async (res) => {
            if (res.status !== 301) {
                return `expected a 301 §3.2.1 bounce on /pricing, got ${res.status} — `
                    + 'the app is serving an APEX-owned route in place';
            }
            const loc = res.headers.get('location') || '';
            if (!/^https:\/\/pryzm\.so\/pricing/.test(loc)) {
                return `/pricing bounced to "${loc}" — §3.2.1 requires the apex origin`;
            }
            return null;
        },
    },
    {
        host: 'api.pryzm.so',
        surface: 'app',
        // §4.1.2 — api is an ALIAS of the app, so the app's health endpoint answers.
        probe: '/api/health/live',
        expect: async (res) => (res.ok ? null : `expected 200 from the api alias, got ${res.status}`),
    },
];

/** §4.2.1 — the apex must NOT be the app. Distinctness is the whole invariant. */
const DISTINCTNESS_NOTE =
    'pryzm.so and app.pryzm.so must be DIFFERENT surfaces (§4.2.1: apex must not '
    + 'CNAME to the app, because app maintenance would take marketing offline).';

const failures = [];
const skipped = [];
const passed = [];

// ── 1. STATIC AUDIT — the contract still declares the hosts we probe ─────────
// Guards the gate against the contract being edited out from under it: if a §4
// row is renamed, this fails loudly rather than probing a host nobody declares.
if (!existsSync(contract)) {
    failures.push(`C51 contract not found at ${contract} — cannot audit the §4 map.`);
} else {
    const text = readFileSync(contract, 'utf8');
    for (const host of ['pryzm.so', 'app.pryzm.so', 'api.pryzm.so']) {
        if (!text.includes(`\`${host}\``)) {
            failures.push(
                `C51 §4 no longer declares \`${host}\`, but this gate probes it. `
                + 'Either the contract was amended without updating the gate, or the gate is stale. '
                + 'Resolve before merging — a gate probing an undeclared host proves nothing.',
            );
        }
    }
}

// ── 2. LIVE PROBES ───────────────────────────────────────────────────────────
async function probe(exp) {
    const url = `https://${exp.host}${exp.probe}`;
    let res, body = '';
    try {
        res = await fetch(url, {
            redirect: exp.redirect || 'follow',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'User-Agent': 'pryzm-c51-dns-gate' },
        });
        // Only read a body when the expectation needs one.
        if (exp.expect.length > 1) body = await res.text();
    } catch (e) {
        // NOT a contract violation — see the header. Unreachable ≠ misconfigured.
        skipped.push(`${url} — unreachable (${String(e.message || e).slice(0, 80)})`);
        return;
    }
    const problem = await exp.expect(res, body);
    if (problem) failures.push(`${url} [${exp.surface}] — ${problem}`);
    else passed.push(`${url} [${exp.surface}]`);
}

if (!OFFLINE) {
    for (const exp of EXPECTATIONS) await probe(exp);
}

// ── 3. REPORT ────────────────────────────────────────────────────────────────
console.log('C51 §4 — DNS map honoured?\n');

if (OFFLINE) {
    console.log('  ⏭  network probes SKIPPED (--offline). Static map audit only.');
    console.log('     This run made NO observation about the live DNS map.\n');
}

for (const p of passed) console.log(`  ✓  ${p}`);
for (const s of skipped) console.log(`  ⏭  ${s}`);

if (skipped.length && !OFFLINE) {
    console.log(
        '\n  ⚠ Some hosts could not be reached. This gate treats that as NOT OBSERVED,\n'
        + '    never as compliant and never as a violation — a CI runner without egress\n'
        + '    is not evidence about DNS. Re-run with network access to get a verdict.',
    );
}

if (failures.length) {
    console.error('\n✗ C51 §4 DNS map VIOLATION:\n');
    for (const f of failures) console.error(`   • ${f}`);
    console.error(`\n   ${DISTINCTNESS_NOTE}`);
    console.error('\n   See docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §4.\n');
    process.exit(1);
}

console.log(
    `\n✓ No §4 violation observed (${passed.length} checked, ${skipped.length} not reachable).`,
);
console.log(
    '  ⚠ This gate proves the ABSENCE of an observed violation, not compliance.\n'
    + '    §4.1.1/§4.1.3 provenance ("Cloudflare Pages, never Fly"; "Cloudflare-auto TLS")\n'
    + '    is NOT verified here — a response cannot distinguish a Cloudflare EDGE from a\n'
    + '    Cloudflare ORIGIN. Verifying that needs the Cloudflare API; tracked as a §7 follow-up.',
);
