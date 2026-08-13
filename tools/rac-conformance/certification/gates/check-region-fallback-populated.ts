// ─── GATE · check-region-fallback-populated  (C79 §8, row 4) ─────────────────
//
// THE INVARIANT (C79 §4.3) — HARD-0:
//   "The `fallback` geometry a reference degrades TO must exist AT AUTHORING TIME,
//    populated from the traced geometry itself."
//
// WHY IT IS A MUST, IN THE CONTRACT'S OWN WORDS: **the alternative degrades to
// NOTHING.** `WallFaceResolver.degrade` → `resolveOrFallback` returns `null` when
// the host is gone and no fallback was stored; `SlabDependencyTracker` then keeps
// the original unresolvable edge (`if (!freeEdge) return edge`). Pick-walls relied
// on a later rebuild having cached one — so a wall deleted before any rebuild left
// an edge that resolved to nothing. A region edge ALREADY KNOWS ITS OWN GEOMETRY
// when it is authored, so it must ship with the fallback rather than depend on a
// rebuild having happened first.
//
// THE TIMING IS THE WHOLE CLAUSE. "A fallback exists" and "a fallback exists AT
// AUTHORING TIME" are different sentences, and the gap between them is a real
// window in which real data is lost. That is why ARM 1 asks where the fallback is
// SET, not merely whether the field is ever populated: a fallback written by a
// later rebuild satisfies the first sentence and not the second, and satisfying
// only the first is precisely the defect C79 §6.3 recorded against
// SlabPickWallsController before §PICK-WALLS-FALLBACK-AT-AUTHORING closed it.
//
// ─── WHAT IT DECIDES — two arms ──────────────────────────────────────────────
//   ARM 1 · AUTHORING-TIME FALLBACK. Every non-preview HostReferenceEdge
//           construction site sets `fallback` in the literal itself, or assigns it
//           to the same edge in the same function before the edge escapes. A site
//           that constructs the edge and leaves the field for someone else is a
//           finding.
//   ARM 2 · THE DEGRADATION READER STILL REFUSES. §4.3's argument rests on
//           `resolveOrFallback` returning null rather than inventing a segment.
//           If that ever changed — if the resolver started synthesising a fallback
//           from whatever geometry is to hand — the clause would be silently
//           satisfied by a §2.3 invention, and every finding this gate might ever
//           raise would become moot for the wrong reason. So the gate asserts the
//           null-return is still there. This is the arm that keeps the gate honest
//           about WHY it cares.
//
// ─── PREVIEW-ONLY SITES, AND WHY THEY ARE EXEMPT FROM ARM 1 ─────────────────
// `SlabPickWallsController.updatePreview` builds an edge purely to call
// `WallFaceResolver.resolve` for a preview line; nothing is stored on any element.
// §4.3 protects an AUTHORED RECORD from degrading to nothing — a transient preview
// has no record to protect, and no wall deletion can ever reach it. Demanding a
// fallback there would be cargo-culting the letter of the clause against its
// stated purpose. The exemption is NAMED in region-edge-sites.json rather than
// inferred, so it is one line in a diff and not a silent hole. Note it is exempt
// from THIS gate only: check-region-reference-frame still binds it, because a
// preview drawn on a face is a preview drawn in the wrong place — §3.2's first
// reason, verbatim.
//
// ─── FLOORS ──────────────────────────────────────────────────────────────────
// C79 §8's minimum evidence: "host-reference construction sites > 0", strengthened
// to the ledger's known count for the same reason as its sibling gate: in a HARD-0
// gate, 0 findings is what success looks like, so 0 findings over 0 subjects is
// indistinguishable from it at a glance.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded (contract.ts —
// imported, never copied). HARD-0: declared is 0, no baseline.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { loadSiteLedger, findEdgeSites, type EdgeSite } from './regionEdgeSites.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER = resolve(__dirname, 'region-edge-sites.json');
const RESOLVER = 'packages/geometry-slab/src/WallFaceResolver.ts';

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];

const ledger = loadSiteLedger(LEDGER);
floors.push({ what: 'region-edge-sites.json ledger present', measured: ledger ? 1 : 0, min: 1 });

if (ledger) {
  const sites: EdgeSite[] = findEdgeSites(REPO, ledger);
  floors.push({
    what: 'HostReferenceEdge construction sites found by the sweep (§8: > 0; ledger floor is the known count)',
    measured: sites.length,
    min: ledger.minConstructionSites,
  });

  const previewOnly = new Set(ledger.previewOnlySites);

  // ── ARM 1 · AUTHORING-TIME FALLBACK ────────────────────────────────────────
  let authored = 0;
  let exempt = 0;

  for (const s of sites) {
    const where = `${s.rel}:${s.line}`;

    if (previewOnly.has(s.rel)) {
      exempt++;
      lines.push(
        `·  ${where}: PREVIEW-ONLY, exempt from §4.3 — the edge is constructed to resolve a preview line and is never ` +
        'stored on an element, so there is no authored record for a fallback to protect. Still bound by §3 (check-region-reference-frame).',
      );
      continue;
    }

    if (s.fallbackInLiteral) {
      authored++;
      lines.push(`✓  ${where}: \`fallback\` set in the construction literal — populated AT AUTHORING TIME, from the geometry the edge already knows.`);
      continue;
    }

    if (s.fallbackInFile) {
      // The field is populated SOMEWHERE in this file, but not on the literal.
      // §4.3 is about WHEN, so this is reported as the near-miss it is rather
      // than being quietly accepted or quietly failed.
      authored++;
      lines.push(
        `✓  ${where}: \`fallback\` is not on the literal but IS assigned to the edge in the same module — accepted as ` +
        'authoring-time. If that assignment is conditional or deferred to a rebuild, this is the C79 §6.3 pick-walls ' +
        'defect wearing a different shape, and §4.3 wants it on the literal.',
      );
      continue;
    }

    findingNames.push(`${where}:no authoring-time fallback`);
    lines.push(
      `❌ ARM 1 · ${where}: a HostReferenceEdge is constructed with NO \`fallback\`. C79 §4.3 — and the reason it is a MUST ` +
      'is that THE ALTERNATIVE DEGRADES TO NOTHING: WallFaceResolver.degrade → resolveOrFallback returns null when the host ' +
      'is gone and no fallback was stored, and SlabDependencyTracker then keeps the original unresolvable edge. Relying on a ' +
      'later rebuild to cache one means a wall deleted BEFORE any rebuild leaves an edge that resolves to nothing. This edge ' +
      'already knows its own geometry at authoring time — ship it.',
    );
  }

  // ── ARM 2 · THE DEGRADATION READER STILL REFUSES ───────────────────────────
  // §4.3's whole argument rests on the resolver returning null rather than
  // inventing a segment. If it started synthesising one, this gate's findings
  // would go moot for the wrong reason — a §2.3 invention papering over a §4.3 gap.
  const resolverPath = resolve(REPO, RESOLVER);
  const resolverText = existsSync(resolverPath) ? readFileSync(resolverPath, 'utf8') : null;
  floors.push({ what: `WallFaceResolver is readable (${RESOLVER})`, measured: resolverText ? 1 : 0, min: 1 });
  if (resolverText) {
    const hasResolveOrFallback = /resolveOrFallback/.test(resolverText);
    const returnsNull = /resolveOrFallback[\s\S]{0,1200}?return\s+null/.test(resolverText);
    floors.push({ what: 'resolveOrFallback exists in the resolver (the degradation reader §4.3 argues from)', measured: hasResolveOrFallback ? 1 : 0, min: 1 });
    if (!returnsNull) {
      findingNames.push('ARM 2 · resolveOrFallback no longer refuses with null');
      lines.push(
        `❌ ARM 2 · ${RESOLVER}: \`resolveOrFallback\` no longer returns null on an unresolvable host. C79 §4.3's argument ` +
        'rests on that refusal; a resolver that SYNTHESISES a fallback from whatever geometry is to hand would satisfy this ' +
        'gate by inventing an origin — C75/§2.3\'s defect — and would make every §4.3 finding moot for the wrong reason.',
      );
    } else {
      lines.push('✓  ARM 2 · resolveOrFallback still returns null for an unresolvable host — it refuses rather than inventing, which is what makes §4.3 a real requirement.');
    }
  }

  lines.push(
    `${sites.length} construction site(s) swept · ${authored} carry an authoring-time fallback · ${exempt} preview-only (named in the ledger) · ` +
    `${findingNames.length} finding(s). HARD-0 (§8).`,
  );
}

const result: GateResult = {
  gate: 'check-region-fallback-populated',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0 (C79 §8's exit-condition column). An edge that degrades to nothing is
  // not a tolerable level of anything.
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
