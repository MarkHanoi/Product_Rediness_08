// §US-3DEP-HAG (L-13314, 2026-09-11, lane DELAWARE-HEIGHTS) — the WIRING of the 3DEP HAG fill tier, pinned.
//
// WHY. The France, Switzerland and Australia stamps were each BUILT and imported by nothing for a day, and
// heights/usOpenHeightsStamp.mjs is still a named orphan. So the wiring is asserted, not assumed — and so is
// the property the lane brief made binding: "Precedence and markers must be decided by ONE function, not
// re-typed per call site." A second `feat.properties =` in the stamp, or a second call of the decision,
// is a second place the marker can be decided, and this spec fails on it.
//
// usasNationalStamp.mjs / us3depHagStamp.mjs import heightSources.mjs (vitest rejects it) and reproject.mjs
// pulls proj4 (not resolvable from the repo root), so — exactly as usasNationalWiring.spec.ts does — the
// sources are read as TEXT.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 binds exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(HERE, p), 'utf8');
const stamp = read('../heights/usasNationalStamp.mjs');
const hagStamp = read('../heights/us3depHagStamp.mjs');
const pure = read('../heights/usOpenHeights.mjs');
const reproject = read('../reproject.mjs');
const hs = read('../heightSources.mjs');
const count = (s: string, re: RegExp) => [...s.matchAll(re)].length;

describe('§US-3DEP-HAG — usasNationalStamp.mjs hosts the fill, and decides through ONE function', () => {
    it('imports the sampler, the pure tier constants and the ONE decision', () => {
        expect(stamp).toMatch(/^import \{ createUs3depHagSampler \} from '\.\/us3depHagStamp\.mjs';/m);
        expect(stamp).toMatch(/^import \{ US_3DEP_HAG, formatHagSummary \} from '\.\/us3depHag\.mjs';/m);
        expect(stamp).toMatch(/usOpenPageUrl, usHeightDecision,\n\} from '\.\/usOpenHeights\.mjs';/);
    });
    it('⭐ exactly ONE property write (applyUsHeightDecision) and exactly ONE decision call', () => {
        expect(count(stamp, /\.properties = /g)).toBe(1);
        expect(stamp).toMatch(/function applyUsHeightDecision\(feat, d\) \{\n\s*const props = feat\.properties \?\? \{\};\n\s*feat\.properties = \{/);
        expect(count(stamp, /usHeightDecision\(cands\)/g)).toBe(1);
        expect(count(stamp, /applyUsHeightDecision\(r\.feat, d\)/g)).toBe(1);
        // The pre-tier inline write is gone — it was the second place a marker could be decided.
        expect(stamp).not.toMatch(/r\.feat\.properties = \{/);
    });
    it('the measured marker is applied ONLY for a measured decision; a storey count becomes building:levels', () => {
        expect(stamp).toMatch(/\.\.\.\(d\.measured \? \{ height: d\.height, heightSource: d\.heightSource, \[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE \} : \{\}\)/);
        expect(stamp).toMatch(/\.\.\.\(d\.levels != null \? \{ 'building:levels': d\.levels, levelsSource: d\.levelsSource \} : \{\}\)/);
    });
    it('the channel is a candidate tier (usas vs authority), the HAG fill is the 3dep-hag tier', () => {
        expect(stamp).toMatch(/tier: ch\.metro === 'usas' \? 'usas' : 'authority', height: h\.height, heightSource: ch\.heightSourceTag/);
        expect(stamp).toMatch(/if \(hg && !hg\.reject\) cands\.push\(\{ tier: '3dep-hag', height: hg\.height, heightSource: US_3DEP_HAG\.heightSourceTag/);
    });
    it('⛔ the fill NEVER runs for a footprint whose channel page FAILED (precedence unknown ⇒ failure, not empty)', () => {
        expect(stamp).toMatch(/if \(res\.failed\) \{ for \(const r of rs\) channelFailed\.add\(r\); continue; \}/);
        expect(stamp).toMatch(/const needHag = fillable\.filter\(\(r\) => !channelFailed\.has\(r\)\);/);
        expect(stamp).toMatch(/hag\.noteChannelFailed\(fillable\.length - needHag\.length\)/);
    });
    it('ONE sampler per run, created for the region bbox (disarmed — no network — outside the working set)', () => {
        expect(count(stamp, /createUs3depHagSampler\(/g)).toBe(1);
        expect(stamp).toMatch(/const hag = hagSampler === undefined \? createUs3depHagSampler\(bbox, \{ timeoutMs \}\) : hagSampler;/);
        expect(stamp).toMatch(/hag: hag \? hag\.stats : null,/);
        expect(stamp).toMatch(/\$\{formatHagSummary\(hag\?\.stats\)\}/);
    });
    it('a storey count is never folded into measuredCount (it has its own counter)', () => {
        expect(stamp).toMatch(/levelsStampedCount: agg\.levelsStamped,/);
        expect([...stamp.matchAll(/estimatedCount: \d/g)].map((m) => m[0])).toEqual(['estimatedCount: 0']);
    });
});

describe('§US-3DEP-HAG — us3depHagStamp.mjs is network + raster only', () => {
    it('loads proj4 (reproject.mjs) and geotiff DYNAMICALLY — never a static import that breaks importers', () => {
        expect(hagStamp).toMatch(/import\('\.\.\/reproject\.mjs'\)/);
        expect(hagStamp).toMatch(/import\('geotiff'\)/);
        expect(hagStamp).not.toMatch(/^import .* from '\.\.\/reproject\.mjs';/m);
        expect(hagStamp).not.toMatch(/^import .* from 'geotiff';/m);
    });
    it('⛔ never writes a property and never touches the measured marker — the host decides', () => {
        expect(hagStamp).not.toMatch(/\.properties\s*=/);
        expect(hagStamp).not.toMatch(/MEASURED_HEIGHT_SRC/);
        expect(hagStamp).toMatch(/hagDecision\(samples, cfg\)/);
    });
    it('§SURVEY-HOLE-FALLBACK: surveys are RANKED, and only a NODATA interior falls back (a small building does not)', () => {
        expect(hagStamp).toMatch(/const cands = rank3depItems\(items\.hag, r\.clon, r\.clat\);/);
        expect(hagStamp).toMatch(/if \(samples\.length === 0 && nodataInside > 0\) \{ holes\.push\(i\); return; \}/);
        expect(hagStamp).toMatch(/for \(let round = 0; pending\.length > 0 && round < cfg\.maxSurveys; round\+\+\)/);
        // …and a footprint that exhausts the budget is refused BY NAME, never left undecided.
        expect(hagStamp).toMatch(/for \(const i of pending\) decide\(out, i, \{ reject: 'no-data'/);
    });
    it('a non-metre survey is REFUSED by name, never converted on a guess', () => {
        expect(hagStamp).toMatch(/if \(it\.unit && it\.unit !== 'metre'\) \{ decide\(out, i, \{ reject: 'crs-unsupported'/);
    });
    it('a failed returns read is a FAILURE for those footprints, never folded into the no-returns refusal', () => {
        expect(hagStamp).toMatch(/if \(retFailed\.has\(k\)\) \{ decide\(out, i, \{ reject: 'error', reason: 'returns window read failed' \}\); return; \}/);
    });
});

describe('§US-3DEP-HAG — the shared seams carry the tier', () => {
    it('US_HEIGHT_TIER_ORDER is the ONE literal ordering', () => {
        expect(pure).toMatch(/^export const US_HEIGHT_TIER_ORDER = Object\.freeze\(\['authority', 'usas', '3dep-hag', 'county-storeys'\]\);$/m);
        expect(count(pure, /'3dep-hag'/g)).toBeGreaterThanOrEqual(2);
    });
    it('reproject.mjs registers EPSG:26918 with an INDEPENDENT control point (Snyder series, not proj4 output)', () => {
        expect(reproject).toMatch(/'EPSG:26918': '\+proj=utm \+zone=18 \+datum=NAD83 \+units=m \+no_defs',/);
        expect(reproject).toMatch(/\['EPSG:26918', -75\.089744, 38\.781987, 492205, 4292588, 5\]/);
    });
    it('heightSources.mjs registers the tier as a live keyless SOURCES row — and delaware stays on usas_national', () => {
        expect(hs).toMatch(/us_3dep_hag: \{\n\s*country: 'us', name: 'USGS 3DEP LiDAR Height-Above-Ground[^\n]*impl: 'live'/);
        expect(hs).toMatch(/us_3dep_hag: \{[\s\S]*?keyless: true,/);
        expect(hs).toMatch(/(^|[\s,])delaware:\s*'usas_national'/m);
    });
});
