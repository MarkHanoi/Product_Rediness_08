#!/usr/bin/env node
/**
 * Paris PLU bioclimatique portal probe — browser automation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Static fetching of https://regles-urbanisme.paris.fr/plu-bioclimatique/ is exhausted.
 * The Règlement page (`document_id=198`) links graphics + Tome 2 only; the Tome 1 text
 * binary is NOT linked from it (see PARIS-PORTAL-RESOURCE-MAP-2026-07-31.md §8).
 * Either a client-side JS control materialises it, or it lives inside the
 * "Télécharger l'intégralité" bundle. Both need a real browser.
 *
 * EVIDENCE RULES (these are the point of the exercise)
 * ---------------------------------------------------
 *  - `Last-Modified`, filename, and upload timestamp are INADMISSIBLE as version evidence.
 *    `id=191` reports June 2026 and its own title page says December 2025.
 *  - The document authenticates itself; the transport layer does not.
 *    Only the title page's approval/effective statement establishes a version.
 *  - Failure != absence. A 403, a timeout, a JS control that fires nothing, and an empty
 *    response are four DIFFERENT results and are recorded as four different results.
 *
 * POLITENESS
 * ----------
 * Single browser, single page at a time, serialised per host, DELAY_MS between actions,
 * real (non-headless-flagged) User-Agent, on-disk artifact cache keyed by SHA-256.
 *
 * USAGE
 * -----
 *   node tools/paris-portal-probe/probe.mjs [--out <dir>] [--headed]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Playwright lives in the shared checkout's pnpm store (this worktree has no node_modules).
const require_ = createRequire(import.meta.url);
const PW_CANDIDATES = [
  'playwright',
  'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright',
];
let chromium = null;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = require_(c)); break; } catch { /* try next */ }
}
if (!chromium) throw new Error('playwright not resolvable from any candidate path');

// ---------------------------------------------------------------- config

const ORIGIN = 'https://regles-urbanisme.paris.fr';
const BASE = `${ORIGIN}/plu-bioclimatique/jsp/site/Portal.jsp`;
const RESOURCE = `${ORIGIN}/plu-bioclimatique/servlet/plugins/document/resource`;

/** Entry points named in the task brief. */
const ENTRY_POINTS = [
  { name: 'reglement', url: `${BASE}?document_id=198&portlet_id=45` },
  { name: 'telecharger-integralite', url: `${BASE}?page_id=4` },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const DELAY_MS = 1200;       // between clicks — be a polite client
const NAV_TIMEOUT = 45_000;
const DOWNLOAD_TIMEOUT = 120_000;

const args = process.argv.slice(2);
const OUT = resolve(
  args.includes('--out') ? args[args.indexOf('--out') + 1] : './paris-probe-out',
);
const HEADED = args.includes('--headed');

const ART = join(OUT, 'artifacts');
mkdirSync(ART, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------- ledgers

/** Every request/response the browser made. */
const network = [];
/** Every control we clicked and what it did. */
const clicks = [];
/** Every binary we obtained, fingerprinted. */
const artifacts = [];
/** Anything that failed — recorded distinctly from "absent". */
const failures = [];

function log(...a) { console.log(...a); }

/**
 * Attach a full network recorder to a page.
 * Captures the redirect chain by walking `redirectedFrom()`, so a 302 to a
 * different resource id is visible rather than silently followed.
 */
function record(page, tag) {
  page.on('request', (req) => {
    network.push({
      phase: 'request', tag, ts: Date.now(),
      url: req.url(), method: req.method(), resourceType: req.resourceType(),
      isNavigation: req.isNavigationRequest(),
    });
  });

  page.on('response', async (res) => {
    const req = res.request();
    // Walk the redirect chain back to its origin.
    const chain = [];
    let r = req.redirectedFrom();
    while (r) { chain.unshift(r.url()); r = r.redirectedFrom(); }
    const h = res.headers();
    network.push({
      phase: 'response', tag, ts: Date.now(),
      url: res.url(), status: res.status(), redirectChain: chain,
      location: h['location'] ?? null,
      contentType: h['content-type'] ?? null,
      contentDisposition: h['content-disposition'] ?? null,
      contentLength: h['content-length'] ?? null,
      lastModified: h['last-modified'] ?? null,   // recorded, but INADMISSIBLE as version evidence
      server: h['server'] ?? null,
      cfRay: h['cf-ray'] ?? null,                 // Cloudflare fingerprint, for the 403 question
    });
  });

  page.on('requestfailed', (req) => {
    failures.push({
      kind: 'requestfailed', tag, url: req.url(),
      error: req.failure()?.errorText ?? null,
    });
  });
}

/** Persist a buffer, fingerprint it, and extract page-1 text if it is a PDF. */
function saveArtifact(name, buf, meta) {
  const hash = sha256(buf);
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'artifact.bin';
  const path = join(ART, `${hash.slice(0, 12)}__${safe}`);
  if (!existsSync(path)) writeFileSync(path, buf);
  const rec = {
    name: safe, path, bytes: buf.length, sha256: hash,
    magic: buf.slice(0, 4).toString('latin1'),
    ...meta,
  };
  artifacts.push(rec);
  log(`    [artifact] ${safe}  ${buf.length}B  sha256=${hash.slice(0, 16)}…`);
  return rec;
}

/**
 * Inventory every plausible download control on the page.
 * Deliberately broad: <a href>, buttons, [onclick], any data-* that smells like a
 * document/resource/file/download id, plus anything whose text mentions
 * télécharger / règlement / tome.
 */
async function inventoryControls(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const WORDS = /(t[ée]l[ée]charg|download|r[ée]glement|tome|int[ée]gralit|zip|pdf|dossier|pi[eè]ce)/i;

    const push = (el, why) => {
      const key = el.tagName + '|' + (el.getAttribute('href') || '') + '|' +
                  (el.textContent || '').trim().slice(0, 60) + '|' + why;
      if (seen.has(key)) return;
      seen.add(key);
      const data = {};
      for (const a of el.attributes) {
        if (a.name.startsWith('data-') || a.name === 'onclick' || a.name === 'id' ||
            a.name === 'class' || a.name === 'target' || a.name === 'download' ||
            a.name === 'type' || a.name === 'name' || a.name === 'value') {
          data[a.name] = a.value;
        }
      }
      const r = el.getBoundingClientRect();
      out.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
        href: el.getAttribute('href') || null,
        resolvedHref: el.href || null,
        attrs: data,
        why,
        visible: r.width > 0 && r.height > 0,
      });
    };

    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (/resource|document|\.pdf|\.zip|download|telecharg/i.test(h) || WORDS.test(a.textContent || '')) {
        push(a, 'anchor');
      }
    }
    for (const el of document.querySelectorAll('[onclick]')) push(el, 'onclick');
    for (const el of document.querySelectorAll('button, input[type=submit], input[type=button]')) {
      push(el, 'button');
    }
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.attributes || []) {
        if (a.name.startsWith('data-') &&
            /(doc|file|resource|download|url|id|pdf|zip)/i.test(a.name)) {
          push(el, 'data-attr:' + a.name);
          break;
        }
      }
    }
    for (const el of document.querySelectorAll('form')) {
      push(el, 'form:action=' + (el.getAttribute('action') || ''));
    }
    return out;
  });
}

/**
 * Click one control on a FRESH page (so a navigation from a previous click cannot
 * poison the next), and classify the outcome into one of five distinct results:
 *   download | navigation-to-binary | navigation-to-html | xhr-only | nothing
 */
async function clickControl(ctx, pageUrl, control, idx) {
  const page = await ctx.newPage();
  record(page, `click#${idx}`);
  const xhrs = [];
  page.on('response', (res) => {
    const rt = res.request().resourceType();
    if (rt === 'xhr' || rt === 'fetch') xhrs.push({ url: res.url(), status: res.status() });
  });

  const result = {
    idx, control: { tag: control.tag, text: control.text, href: control.href, why: control.why, attrs: control.attrs },
    pageUrl, outcome: null, detail: null,
  };

  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    // Re-locate the control in this fresh DOM.
    const handle = await page.evaluateHandle((c) => {
      const all = Array.from(document.querySelectorAll('a,button,input,form,[onclick],[data-doc],[data-file]'));
      return all.find((el) => {
        const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160);
        const h = el.getAttribute && el.getAttribute('href');
        return (c.href && h === c.href) || (!!c.text && t === c.text);
      }) || null;
    }, control);

    const el = handle.asElement();
    if (!el) {
      result.outcome = 'control-not-found-on-reload';
      await page.close();
      return result;
    }

    const dlPromise = page.waitForEvent('download', { timeout: 12_000 }).catch(() => null);
    const navPromise = page.waitForNavigation({ timeout: 12_000 }).catch(() => null);

    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ timeout: 8000, force: true }).catch(async (e) => {
      // Some Lutece controls are non-clickable wrappers; fire the handler directly.
      result.detail = 'click threw: ' + e.message.split('\n')[0] + ' → dispatched programmatically';
      await el.evaluate((n) => n.click?.() ?? n.submit?.()).catch(() => {});
    });

    const [dl, nav] = await Promise.all([dlPromise, navPromise]);

    if (dl) {
      const p = await dl.path();
      const buf = readFileSync(p);
      result.outcome = 'download';
      result.detail = { suggestedFilename: dl.suggestedFilename(), url: dl.url() };
      result.artifact = saveArtifact(dl.suggestedFilename(), buf, {
        via: 'download-event', sourceUrl: dl.url(), controlText: control.text,
      });
    } else if (nav) {
      const ct = (nav.headers()['content-type'] || '').toLowerCase();
      result.outcome = /pdf|zip|octet/.test(ct) ? 'navigation-to-binary' : 'navigation-to-html';
      result.detail = { url: nav.url(), status: nav.status(), contentType: ct };
      if (/pdf|zip|octet/.test(ct)) {
        const buf = await nav.body().catch(() => null);
        if (buf) {
          result.artifact = saveArtifact(
            (nav.headers()['content-disposition'] || '').match(/filename="?([^";]+)/)?.[1] || 'nav.bin',
            buf, { via: 'navigation', sourceUrl: nav.url(), controlText: control.text });
        }
      }
    } else if (xhrs.length) {
      result.outcome = 'xhr-only';
      result.detail = xhrs.slice(0, 20);
    } else {
      result.outcome = 'nothing';   // control fired, produced no network effect
    }
  } catch (e) {
    result.outcome = 'error';
    result.detail = e.message.split('\n')[0];
    failures.push({ kind: 'click-error', idx, control: control.text, error: result.detail });
  }

  await page.close().catch(() => {});
  clicks.push(result);
  log(`  [click ${idx}] ${result.outcome.padEnd(26)} :: ${(control.text || control.href || control.why).slice(0, 70)}`);
  await sleep(DELAY_MS);
  return result;
}

/** Fetch a resource id straight through the browser context (keeps cookies/UA identical). */
async function fetchResource(ctx, id, label) {
  const url = `${RESOURCE}?id=${id}&id_attribute=93&nocache=true&working_content=true`;
  try {
    const res = await ctx.request.get(url, { timeout: 90_000 });
    const h = res.headers();
    const buf = Buffer.from(await res.body());
    network.push({
      phase: 'apirequest', tag: label, url, status: res.status(),
      contentType: h['content-type'] ?? null,
      contentDisposition: h['content-disposition'] ?? null,
      contentLength: h['content-length'] ?? null,
      lastModified: h['last-modified'] ?? null,
      server: h['server'] ?? null, cfRay: h['cf-ray'] ?? null,
    });
    if (res.status() !== 200 || buf.length === 0) {
      failures.push({ kind: 'resource-non-200-or-empty', id, status: res.status(), bytes: buf.length });
      log(`  [res ${id}] status=${res.status()} bytes=${buf.length}  (NOT absence — recorded as-is)`);
      return null;
    }
    const fn = (h['content-disposition'] || '').match(/filename="?([^";]+)/)?.[1] || `id${id}.bin`;
    const rec = saveArtifact(fn, buf, {
      via: 'context.request', sourceUrl: url, resourceId: id, label,
      lastModifiedHeader: h['last-modified'] ?? null,   // INADMISSIBLE as version evidence
    });
    await sleep(DELAY_MS);
    return rec;
  } catch (e) {
    failures.push({ kind: 'resource-fetch-error', id, error: e.message.split('\n')[0] });
    log(`  [res ${id}] ERROR ${e.message.split('\n')[0]}`);
    return null;
  }
}

// ---------------------------------------------------------------- main

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: !HEADED });
  const ctx = await browser.newContext({
    userAgent: UA,
    acceptDownloads: true,
    locale: 'fr-FR',
    extraHTTPHeaders: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
  });

  for (const ep of ENTRY_POINTS) {
    log(`\n=== ENTRY POINT: ${ep.name}  ${ep.url}`);
    const page = await ctx.newPage();
    record(page, ep.name);
    let res;
    try {
      res = await page.goto(ep.url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    } catch (e) {
      failures.push({ kind: 'entry-nav-error', ep: ep.name, error: e.message.split('\n')[0] });
      log(`  NAV ERROR: ${e.message.split('\n')[0]}`);
      await page.close();
      continue;
    }
    log(`  status=${res.status()} title="${await page.title()}"`);

    // Dump the rendered DOM for offline inspection — the JS-generated controls
    // are only present AFTER scripts run, which is the whole reason for Playwright.
    writeFileSync(join(OUT, `dom-${ep.name}.html`), await page.content(), 'utf8');

    const controls = await inventoryControls(page);
    writeFileSync(join(OUT, `controls-${ep.name}.json`), JSON.stringify(controls, null, 2), 'utf8');
    log(`  controls inventoried: ${controls.length}`);
    await page.close();

    let i = 0;
    for (const c of controls) {
      i += 1;
      await clickControl(ctx, ep.url, c, `${ep.name}:${i}`);
    }
  }

  // Targeted resource pulls the brief calls for.
  log('\n=== TARGETED RESOURCE PULLS');
  await fetchResource(ctx, 137, 'DG_E_HAUTEUR — page-asserted "plan des hauteurs"');
  await fetchResource(ctx, 191, 'REG1 Tome 1 — known Version 59, for delta baseline');

  writeFileSync(join(OUT, 'network.json'), JSON.stringify(network, null, 2), 'utf8');
  writeFileSync(join(OUT, 'clicks.json'), JSON.stringify(clicks, null, 2), 'utf8');
  writeFileSync(join(OUT, 'artifacts.json'), JSON.stringify(artifacts, null, 2), 'utf8');
  writeFileSync(join(OUT, 'failures.json'), JSON.stringify(failures, null, 2), 'utf8');

  log(`\n=== SUMMARY`);
  log(`  network events : ${network.length}`);
  log(`  controls clicked: ${clicks.length}`);
  log(`  artifacts saved : ${artifacts.length}`);
  log(`  failures        : ${failures.length}`);
  const byOutcome = {};
  for (const c of clicks) byOutcome[c.outcome] = (byOutcome[c.outcome] || 0) + 1;
  log(`  outcomes        : ${JSON.stringify(byOutcome)}`);
  log(`  out dir         : ${OUT}`);

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
