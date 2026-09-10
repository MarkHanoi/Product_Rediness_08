// measure-open.mjs — PERF-OPEN lane baseline harness.
//
// THE MEASUREMENT, stated before it is taken:
//   START = the "+ New Project" gesture (click on #ph-new-btn in the hub). This is the
//           founder's gesture. It is also exactly where `PlatformRouter.showOnboarding`
//           calls `beginStartupBudget()` and marks `onboarding:shown`, so the existing
//           §STARTUP-BUDGET instrument's t0 and this harness's t0 are the SAME instant.
//   END   = the globe is INTERACTIVE. Two INDEPENDENT instruments, deliberately, because
//           this repo's dominant defect is an instrument watching something adjacent:
//             (A) console mark `globe:camera-host-ready` — the in-app claim that the
//                 Cesium camera host is live (the user can drag the globe and the search
//                 box can fly it).
//             (B) DOM-side poll, owned by this harness and independent of app code:
//                 the Cesium canvas has non-zero size AND is not display:none/visibility:hidden
//                 AND the location input is visible AND enabled AND hit-testable at its
//                 own centre point (i.e. a real click would reach it).
//           If (A) and (B) disagree by much, the disagreement IS the finding.
//
// Everything is recorded relative to the gesture, not to navigation.

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.MEASURE_BASE ?? 'http://localhost:5000';
const EMAIL = process.env.MEASURE_EMAIL ?? process.env.PRYZM_OWNER_EMAIL;
const PASSWORD = process.env.MEASURE_PASSWORD ?? process.env.PRYZM_OWNER_PASSWORD;
const OUT = process.env.MEASURE_OUT ?? 'measure-out.json';
const LABEL = process.env.MEASURE_LABEL ?? 'run';
const HEADLESS = process.env.MEASURE_HEADED ? false : true;

if (!EMAIL || !PASSWORD) {
    console.error('MEASURE_EMAIL / MEASURE_PASSWORD required');
    process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            // Cesium + the WebGPU renderer need a real GPU path. SwiftShader is the
            // deterministic-but-slow fallback; --use-angle=default lets Chromium pick the
            // real adapter when one is present. Recorded here because the ABSOLUTE numbers
            // depend on it — the before/after comparison does not, as long as it is identical.
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan,UseSkiaRenderer',
            '--ignore-gpu-blocklist',
            '--use-angle=default',
        ],
    });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();

    const marks = [];      // { phase, tMs }  — tMs relative to the gesture
    const allConsole = [];
    let gestureAt = null;  // performance.now()-ish origin, in harness wall clock

    page.on('console', (msg) => {
        const text = msg.text();
        const at = Date.now();
        allConsole.push({ at, text: text.slice(0, 400) });
        const m = /\[§STARTUP-BUDGET\]\s+(\S+)\s+\+(\d+)ms\s+\(t\+(\d+)ms\)/.exec(text);
        if (m) {
            marks.push({
                phase: m[1],
                deltaPrevMs: Number(m[2]),
                appTMs: Number(m[3]),
                harnessTMs: gestureAt === null ? null : at - gestureAt,
            });
        }
    });
    page.on('pageerror', (e) => allConsole.push({ at: Date.now(), text: `PAGEERROR ${e.message}`.slice(0, 400) }));

    // ── 1. Load + sign in ────────────────────────────────────────────────────
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Open the auth modal. The landing page's sign-in affordance is a text button;
    // find it by accessible text rather than a testid (AuthModal carries no testids).
    await page.waitForTimeout(2500);
    const signInCandidates = ['#lp-nav-login', 'button:has-text("Log in")', 'button:has-text("Sign in")'];
    for (const sel of signInCandidates) {
        const el = page.locator(sel).first();
        if (await el.count() && await el.isVisible().catch(() => false)) { await el.click(); break; }
    }
    await page.waitForSelector('#am-email', { timeout: 20_000 });
    await page.fill('#am-email', EMAIL);
    await page.fill('#am-password', PASSWORD);
    await page.locator('#am-password').press('Enter');

    // ── 2. Wait for the hub ──────────────────────────────────────────────────
    await page.waitForSelector('#ph-new-btn', { timeout: 60_000, state: 'visible' });
    // Let the hub settle so hub warm/sync work is NOT charged to the open.
    await page.waitForTimeout(6000);

    // ── 3. THE GESTURE ───────────────────────────────────────────────────────
    const t0 = Date.now();
    gestureAt = t0;
    await page.evaluate(() => { performance.mark('PERFOPEN_gesture'); });
    await page.click('#ph-new-btn');

    // ── 4. Poll instrument (B), independent of app marks ─────────────────────
    let domInteractiveAt = null;
    let domDetail = null;
    const deadline = t0 + 180_000;
    while (Date.now() < deadline) {
        const probe = await page.evaluate(() => {
            const inp = document.querySelector('[data-testid="onboarding-location-input"]');
            if (!inp) return { stage: 'no-input' };
            const ir = inp.getBoundingClientRect();
            const istyle = getComputedStyle(inp);
            const inputVisible =
                ir.width > 0 && ir.height > 0 &&
                istyle.display !== 'none' && istyle.visibility !== 'hidden' &&
                Number(istyle.opacity) > 0.01 && !inp.disabled;
            // Hit-test: would a real click at the input's centre reach it?
            const hit = document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2);
            const inputHittable = !!hit && (hit === inp || inp.contains(hit) || hit.contains(inp));

            // The Cesium canvas: the largest canvas that is laid out and painted.
            const canvases = Array.from(document.querySelectorAll('canvas'));
            let best = null;
            for (const c of canvases) {
                const r = c.getBoundingClientRect();
                const s = getComputedStyle(c);
                const shown = r.width > 200 && r.height > 200 &&
                    s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01;
                // also require the ancestor chain to be visible
                let vis = shown, n = c.parentElement, guard = 0;
                while (vis && n && guard++ < 40) {
                    const ns = getComputedStyle(n);
                    if (ns.display === 'none' || ns.visibility === 'hidden' || Number(ns.opacity) < 0.01) vis = false;
                    n = n.parentElement;
                }
                if (vis && (!best || r.width * r.height > best.area)) {
                    best = { area: r.width * r.height, w: Math.round(r.width), h: Math.round(r.height), cls: c.className || '(none)', id: c.id || '(none)' };
                }
            }
            return { stage: 'probing', inputVisible, inputHittable, canvas: best };
        }).catch(() => ({ stage: 'eval-failed' }));

        if (probe.stage === 'probing' && probe.inputVisible && probe.inputHittable && probe.canvas) {
            domInteractiveAt = Date.now();
            domDetail = probe;
            break;
        }
        if (marks.some((m) => m.phase === 'globe:camera-host-ready') && Date.now() - t0 > 5000) {
            // give the DOM probe a short grace window after the app claims readiness,
            // then stop regardless — the gap is itself data.
            if (!domInteractiveAt && Date.now() - t0 > 40_000) break;
        }
        await sleep(60);
    }

    // Let a few more marks land so the table is complete.
    await sleep(4000);

    const markAt = (phase) => {
        const m = marks.find((x) => x.phase === phase);
        return m ? m.harnessTMs : null;
    };

    const result = {
        label: LABEL,
        base: BASE,
        gestureAtEpoch: t0,
        END_globe_camera_host_ready_ms: markAt('globe:camera-host-ready'),
        END_dom_interactive_ms: domInteractiveAt === null ? null : domInteractiveAt - t0,
        location_step_open_ms: markAt('location-step:open'),
        globe_prewarm_done_ms: markAt('globe:prewarm-done'),
        open_project_loaded_ms: markAt('open:project-loaded'),
        boot_engine_start_ms: markAt('boot:engine-start'),
        boot_ui_done_ms: markAt('boot:ui-done'),
        domDetail,
        marks,
        consoleTail: allConsole.slice(-400),
    };

    writeFileSync(OUT, JSON.stringify(result, null, 2));

    console.log(`\n===== ${LABEL} =====`);
    console.log('phase                          Δprev   t+(harness ms)');
    for (const m of marks) {
        console.log(
            `${m.phase.padEnd(30)} ${String(m.deltaPrevMs).padStart(6)}  ${m.harnessTMs === null ? '   (pre-gesture)' : String(m.harnessTMs).padStart(8)}`,
        );
    }
    console.log('---');
    console.log('END (A) globe:camera-host-ready :', result.END_globe_camera_host_ready_ms, 'ms');
    console.log('END (B) DOM interactive        :', result.END_dom_interactive_ms, 'ms');
    console.log('domDetail:', JSON.stringify(domDetail));

    await browser.close();
}

run().catch((e) => { console.error('HARNESS FAILED:', e); process.exit(1); });
