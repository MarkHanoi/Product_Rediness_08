// ─── GATE · check-authored-state-protection  (BIM30 R8) ──────────────────────
//
// R8 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md. The plan doc names this
// gate's subject in R8's own words, and it is the EXIT CONDITION verbatim:
//
//   "`ElementOrigin` lands in schemas (the roadmap's provenance fields ARE this — one
//    stream, not two); regeneration becomes an authority question over it; the report's
//    provenance section goes from actor-metadata to element-grain. Generation engines gain
//    already-generated awareness (the duplicate-on-rerun defects) and the house executor's
//    silent room deletion becomes a reported, refusable consequence.
//    **Exit**: the authored-state-protection scenario (review §6) passes as an executed test."
//
// The scenario is BIM30-CONTRACT-REVIEW-PART-E §6, finding **E-13**, whose whole point is
// that no artefact in the corpus runs it:
//
//   "six elements — an authored wall, a generated wall, an authored opening, a generated
//    opening, an inferred room, an AI-proposed element — then 'regenerate the affected
//    area', then seven verifications (authored wall byte-intact · authored opening
//    byte-intact · generated wall updated · generated opening revalidated · inferred room
//    re-derived with provenance preserved-or-updated · AI element still marked INFERRED · a
//    report stating which of the six were touched and why)."
//
// E-13 also states the rule this gate lands under: "It should be named now, RED, per the
// roadmap's own §0.1 rule (a gate lands before its implementation, and lands RED)."
// ⛔ THIS GATE LANDS RED ON PURPOSE. It is pinned in gate-newly-measured.json. Read the
// findings, not the exit code: nothing got worse today, an instrument arrived.
//
// ── THE SUBSTRATE, MEASURED RATHER THAN ASSUMED (2026-08-12) ─────────────────
//
// R8's own line in the plan doc says it "blocks on roadmap Phase 8 (provenance fields)".
// Phase 8 is HALF landed, and the halves matter:
//
//   ✓ LANDED — the five-value vocabulary at L0. `@pryzm/schemas/provenance`'s `ValueOrigin`
//     / `ValueProvenance` (commit 57f2b539, C75 §1–§2). This gate IMPORTS it and never
//     re-derives it: a gate that reimplements a vocabulary certifies its own copy.
//   ⛔ NOT LANDED — the field ON ELEMENTS. Measured at HEAD: every `origin:` in
//     `packages/schemas/src/elements/*` is a geometric `Vec3`, and `generationId` /
//     `generatedBy` / `isGenerated` / `sourceGenerator` return ZERO first-party hits.
//   ⛔ NOT LANDED — any `*.regenerate` verb. There is none. `GENERATE_STAIR_GEOMETRY` and
//     `ai.floorplan.generate` exist; neither regenerates an area over mixed provenance.
//     The house/apartment generators are NOT bus verbs at all — they are UI controllers,
//     which is precisely why no verb can enforce clear-then-rebuild centrally.
//
// So four of the scenario's seven verifications have no subject at HEAD, and this gate
// **prints each of them as NOT EVALUATED, with the reason**, rather than scoring them.
// That is the E3 lesson applied: an arm that cannot be honestly evaluated says so. A gate
// that silently dropped them would report a better number over a smaller world.
//
// ── WHAT IS GENUINELY EXECUTABLE TODAY, AND WHY IT IS ROOMS ──────────────────
//
// One element-grain provenance signal exists in the whole repository:
// `RoomBoundary.detectionMethod` (`packages/room-topology/src/RoomTypes.ts:100`) — C75 §4.d
// names it and notes it lives outside L0. Its five members map onto C75's five values, and
// `manual-boundary` / `point-pick` are GENUINE evidence of human authorship (RoomTool
// stamps them when the user draws or picks). That makes the authored-vs-generated
// distinction REAL for rooms and for nothing else — so the scenario runs at room grain,
// through the REAL RoomStore and the REAL `room.delete` handler, and the gate says plainly
// that walls, openings and AI elements are out of reach.
//
// ── WHAT IT DRIVES ───────────────────────────────────────────────────────────
//
//   ElementProvenanceIndex (R8, production — apps/editor/src/engine/provenance/)
//     → @pryzm/schemas/provenance  (L0, the ONE vocabulary — imported, never restated)
//   the REAL RoomStore (@pryzm/room-topology) seeded with mixed-provenance rooms
//     → the REAL CommandBus (@pryzm/command-bus)
//       → the REAL plugins/rooms DeleteRoomHandler (`room.delete`)
//         → the REAL window.commandManager bridge → the REAL RoomStore removal
//
// ── THE FIVE CLAUSES ─────────────────────────────────────────────────────────
//   (a) THE AUTHORITY QUESTION IS ANSWERED AT ELEMENT GRAIN, three ways — an authored room
//       is `refused`, a system-produced room is `allowed`, and a room with no provenance is
//       `unknown-authority` and NOT silently either of the other two. With a CONTROL: the
//       same function must NOT return the same answer for all three, or it proves nothing.
//   (b) THE LOAD-BEARING ARM — the live §GRAPH-CLEAR-FIRST loop, executed. The REAL
//       unfiltered clear (`getByLevel` → `room.delete` for every id) is run against a level
//       holding an authored room, through the REAL bus and the REAL handler, and the gate
//       measures whether the authored room SURVIVES. It does not. That is the defect R8
//       names, reproduced rather than described — and it is a FINDING, not a floor, because
//       fixing it is a change inside HouseLayoutExecutor.ts, another agent's live territory.
//   (c) THE REPORTED, REFUSABLE FORM — `planRegenerationClear` over the SAME set must refuse
//       and must name the authored room, with BOTH counts in its sentence. Run beside (b) so
//       the difference between what the executor does and what it should ask is measured in
//       one run, on one fixture.
//   (d) ALREADY-GENERATED AWARENESS — `queryPriorGeneration` with no declared run must
//       return `undetermined`, NOT an empty `stillPresent`. This is the known+unknown=[]
//       defect at its own doorstep: a generator with no memory cannot tell an empty model
//       from an un-instrumented one. CONTROL: with a run declared, it must return
//       `determined` and find the surviving ids — so `undetermined` is a reading, not a stub.
//   (e) THE FOUR UNREACHABLE VERIFICATIONS ARE PRINTED AS UNREACHABLE, each with the reason
//       and the substrate that would close it. Asserted as a COUNT so the list cannot
//       quietly shrink to make the gate look better.
//
// ── STUB LEDGER, declared loudly (world.ts doctrine) ─────────────────────────
//   • happy-dom installed in-process — `plugins/rooms`' DeleteRoomHandler bridges through
//     `window.commandManager` by design (its own header says so), so a DOM is required to
//     drive the REAL handler. Nothing here reads a pixel.
//   • The §GRAPH-CLEAR-FIRST loop in clause (b) is TRANSCRIBED from
//     HouseLayoutExecutor.ts:1757-1766, not imported: the executor is a 254 KB UI class
//     requiring a full runtime, and it is another agent's live territory this session. The
//     transcription is asserted line-shape-for-line-shape in the source comment above the
//     loop, and what it drives — RoomStore.getByLevel, the bus, the real handler — is REAL.
//     ⚠ This is the gate's weakest link and it is named as such: it proves the PATTERN
//     destroys authored rooms, not that this exact executor instance does.
//   • No wall / opening / AI-element arm is simulated to fill the scenario out. Four
//     verifications are UNREACHABLE and are reported that way (clause e).

import { Window } from 'happy-dom';
import { reportGate, type GateResult, type Floor } from '../contract.js';

// ── DOM install, BEFORE any @pryzm module loads (trackers-gate pattern) ───────
const hw = new Window({ url: 'http://localhost/' }) as unknown as Record<string, unknown>;
for (const k of [
  'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'CustomEvent',
  'EventTarget', 'Node', 'location', 'requestAnimationFrame', 'cancelAnimationFrame',
  'getComputedStyle', 'DOMParser', 'Image', 'SVGElement', 'MutationObserver', 'ResizeObserver',
]) {
  const v = hw[k];
  if (v === undefined) continue;
  try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
  catch { /* non-configurable host global — the run reports loudly if it matters */ }
}
Object.defineProperty(globalThis, 'window', { value: hw, configurable: true, writable: true });

/** Copied from ../world.ts's stub ledger — happy-dom canvas 2D shim. BimManager builds a
 *  LevelVisualizer at construction and that draws to a 2D context. */
function shimCanvas2D(): void {
  const proto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext: (...a: unknown[]) => unknown } } })
    .HTMLCanvasElement?.prototype;
  if (!proto) return;
  const original = proto.getContext;
  proto.getContext = function (this: unknown, ...args: unknown[]) {
    const real = original.apply(this, args as never);
    if (real) return real;
    return new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        if (prop === 'canvas') return this;
        return () => undefined;
      },
      set: () => true,
    });
  };
}
shimCanvas2D();

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const harnessErrors: string[] = [];

/** A stable UUID per index — RoomDataAddSchema requires `id` to be a real UUID. */
function uuid(n: number): string {
  const h = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${h}`;
}

async function run(): Promise<GateResult> {
  const wnd = globalThis.window as unknown as Record<string, unknown>;
  wnd.__pryzmInitComplete = true;

  // ── The composed world: real stores, real CommandManager, real bus ──────────
  const THREE = await import('@pryzm/renderer-three/three');
  const cam = await import('@pryzm/core-app-model');
  const { BimManager, ProjectContext } = cam as unknown as {
    BimManager: new (s: unknown, r: unknown) => Record<string, unknown>;
    ProjectContext: new () => Record<string, unknown>;
  };
  const { WallStore } = await import('@pryzm/geometry-wall');
  const { RoomStore } = await import('@pryzm/room-topology');
  const { CommandManager } = (await import('@pryzm/command-registry')) as unknown as {
    CommandManager: new (ctx: unknown) => { execute: (c: unknown) => unknown };
  };
  const { CommandBus } = await import('@pryzm/command-bus');

  // ── The PRODUCTION R8 module under test ─────────────────────────────────────
  const {
    classify, mayRegenerate, planRegenerationClear, queryPriorGeneration, classifyRoomBoundary,
  } = await import('../../../../apps/editor/src/engine/provenance/ElementProvenanceIndex.js');

  floors.push({
    what: 'the PRODUCTION R8 provenance index loaded (classify + authority + clear-plan + prior-generation)',
    measured: [classify, mayRegenerate, planRegenerationClear, queryPriorGeneration, classifyRoomBoundary]
      .every((m) => typeof m === 'function') ? 1 : 0,
    min: 1,
  });

  // The L0 vocabulary is IMPORTED, never restated — a gate that reimplements the union
  // certifies its own copy. Its presence is a floor: R8's first exit clause is that the
  // five-value type exists in schemas, so a run where it does not is MISCONFIGURED, not red.
  const { VALUE_ORIGINS, mayBePresentedAsAuthored } = await import('@pryzm/schemas/provenance');
  floors.push({
    what: "the L0 five-value vocabulary exists in packages/schemas (R8 exit clause 1: '`ElementOrigin` lands in schemas')",
    measured: Array.isArray(VALUE_ORIGINS) && VALUE_ORIGINS.length === 5 ? 1 : 0,
    min: 1,
  });

  const projectContext = new ProjectContext();
  const bimManager = new BimManager(new (THREE as unknown as { Scene: new () => unknown }).Scene(), undefined);
  wnd.projectContext = projectContext;
  wnd.bimManager = bimManager;

  const wallStore = new WallStore(projectContext as never, bimManager as never);
  const roomStore = new RoomStore(projectContext as never, bimManager as never);
  const stores: Record<string, unknown> = { wallStore, roomStore };
  for (const [k, v] of Object.entries(stores)) wnd[k] = v;

  const ctx = { bimManager, projectContext, stores, commandManager: undefined as unknown };
  const cm = new CommandManager(ctx);
  ctx.commandManager = cm;
  wnd.commandManager = cm;

  const levels = (bimManager as unknown as { getLevels(): Array<{ id: string }> }).getLevels() ?? [];
  const LEVEL = levels[0]?.id ?? 'L0';

  const dtoStores: Record<string, Record<string, unknown>> = { wall: {}, room: {} };
  const bus = new CommandBus({
    audit: { actorId: 'cert-harness', projectId: 'bim30-r8', clientId: 'node' },
    storesProvider: () => dtoStores as never,
  } as never);

  // The REAL room.delete handler (plugins/rooms — the legacy-bridge handler).
  let handlerRegistered = 0;
  try {
    const mod = await import('../../../../plugins/rooms/src/handlers/DeleteRoom.js') as Record<string, unknown>;
    for (const v of Object.values(mod)) {
      if (typeof v === 'function') {
        try {
          const inst = new (v as new () => { type?: string })();
          if (inst.type === 'room.delete') { bus.register(inst as never); handlerRegistered = 1; break; }
        } catch { /* not a zero-arg constructible handler — keep looking */ }
      }
    }
  } catch (e) { harnessErrors.push('room.delete handler import: ' + String(e).slice(0, 300)); }
  floors.push({ what: 'REAL room.delete handler registered on the REAL bus', measured: handlerRegistered, min: 1 });

  // ── Fixture: a level holding rooms of DIFFERENT provenance ──────────────────
  let seq = 1;
  const mkRoom = (name: string, detectionMethod: string, x = 0): Record<string, unknown> => {
    const id = uuid(seq++);
    const poly = [
      { x: x + 0, z: 0 }, { x: x + 4, z: 0 }, { x: x + 4, z: 4 }, { x: x + 0, z: 4 },
    ];
    return {
      id, type: 'room', levelId: LEVEL, name, roomNumber: String(seq).padStart(2, '0'),
      boundary: { polygon: poly, height: 2.7, baseOffset: 0, detectionMethod },
      boundingWallIds: [], boundingSlabIds: [], boundingColumnIds: [],
      occupancyType: 'unclassified', finishes: {},
      computed: {
        area: 16, grossArea: 16, perimeter: 16, volume: 43.2,
        centroid: { x: x + 2, z: 2 },
        boundingBox: { minX: x + 0, minZ: 0, maxX: x + 4, maxZ: 4 },
      },
      properties: {},
      metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'cert', version: 1 },
    };
  };

  // ══ Clause (a) — the authority question, answered three ways ════════════════
  let authoredRefused = 0; let generatedAllowed = 0; let unknownIsUnknown = 0; let authorityDiscriminates = 0;
  try {
    // An AUTHORED room — the user drew its boundary. This is not a simulation of
    // authorship: `manual-boundary` is what RoomTool.ts:199 stamps when a human draws.
    const authored = mkRoom('Study (drawn by the user)', 'manual-boundary');
    // A SYSTEM-PRODUCED room — flood-filled from the wall graph.
    const generated = mkRoom('Room 02', 'auto-topology', 6);
    // A room with NO provenance signal at all — the state every wall, door and window in
    // the repository is in today.
    const opaque = { id: 'element-with-no-provenance', metadata: { createdBy: 'system' } };

    const aAuth = mayRegenerate(authored as never);
    const gAuth = mayRegenerate(generated as never);
    const oAuth = mayRegenerate(opaque as never);

    authoredRefused = aAuth.kind === 'refused' ? 1 : 0;
    if (!authoredRefused) {
      findingNames.push(`(a) an AUTHORED element was not protected — authority='${aAuth.kind}'. A human drew this boundary; a regeneration pass may not silently replace it (C75 §2.2).`);
    }
    generatedAllowed = gAuth.kind === 'allowed' ? 1 : 0;
    if (!generatedAllowed) {
      findingNames.push(`(a) a SYSTEM-PRODUCED element was not clearable — authority='${gAuth.kind}'. Over-protection stops every generator from running.`);
    }
    unknownIsUnknown = oAuth.kind === 'unknown-authority' ? 1 : 0;
    if (!unknownIsUnknown) {
      findingNames.push(`(a) an element of UNKNOWN provenance was classified '${oAuth.kind}' — collapsing the third answer into either of the other two is the defect: 'allowed' destroys user work silently, 'refused' blocks every generator.`);
    }

    // CONTROL — a function returning one constant answer would pass any single assertion
    // above. Three DISTINCT kinds is the observation that makes the clause mean anything.
    const kinds = new Set([aAuth.kind, gAuth.kind, oAuth.kind]);
    authorityDiscriminates = kinds.size === 3 ? 1 : 0;

    // And the L0 predicate agrees about the ONE claim that matters — imported, not re-derived.
    const presentable = mayBePresentedAsAuthored(classify(authored as never));
    const notPresentable = mayBePresentedAsAuthored(classify(generated as never));

    lines.push(`(a) element-grain authority → authored='${aAuth.kind}' · system-produced='${gAuth.kind}' · no-provenance='${oAuth.kind}' · distinct kinds=${kinds.size}/3 — ` +
      (authorityDiscriminates ? 'the index discriminates, so each answer is a decision.' : 'THE INDEX DOES NOT DISCRIMINATE (floor).'));
    lines.push(`(a) C75 §2.6 mayBePresentedAsAuthored (L0, imported) → authored room=${presentable} · flood-filled room=${notPresentable}`);
    lines.push(`(a) detectionMethod → origin: manual-boundary='${classifyRoomBoundary('manual-boundary').origin}' · point-pick='${classifyRoomBoundary('point-pick').origin}' · auto-topology='${classifyRoomBoundary('auto-topology').origin}' · ai-generated='${classifyRoomBoundary('ai-generated').origin}' · ifc-import='${classifyRoomBoundary('ifc-import').origin}' · absent='${String(classifyRoomBoundary(undefined).origin)}(${classifyRoomBoundary(undefined).unknownReason})'`);

    // ⚠ A NAMED FINDING, not a pass: `auto-topology` is ALSO roomSnapshotUtils.ts:156's
    // `||` default, so this value cannot distinguish "flood-filled" from "not recorded".
    // C75's PV-01, live at HEAD. Reported here rather than laundered by the translation.
    findingNames.push("(a) PV-01 LIVE — `auto-topology` is both a real detection method AND the `|| 'auto-topology'` default at roomSnapshotUtils.ts:156, so a room reading it is ambiguous between flood-filled and origin-not-recorded. The translation cannot separate them and does not pretend to.");
  } catch (e) { harnessErrors.push('(a): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'CONTROL — the authority function returns THREE DISTINCT answers (not one constant)', measured: authorityDiscriminates, min: 1 });

  // ══ Clause (b) — LOAD-BEARING: the LIVE clear loop, executed ════════════════
  let authoredRoomSurvived = 0; let clearActuallyRan = 0;
  try {
    const authored = mkRoom('Study (drawn by the user)', 'manual-boundary');
    const generated = mkRoom('Room 02', 'auto-topology', 6);
    roomStore.add(authored as never);
    roomStore.add(generated as never);
    const seeded = (roomStore as unknown as { getByLevel(l: string): Array<{ id: string }> }).getByLevel(LEVEL).length;

    // ── THE TRANSCRIBED §GRAPH-CLEAR-FIRST LOOP ───────────────────────────────
    // HouseLayoutExecutor.ts:1757-1766, shape for shape. Unfiltered: every room on the
    // level, no provenance check, fire-and-forget, errors swallowed.
    const stale = (roomStore as unknown as { getByLevel?(l: string): ReadonlyArray<{ id: string }> }).getByLevel?.(LEVEL) ?? [];
    for (const r of stale) {
      try { await (bus as unknown as { executeCommand(t: string, p: unknown): Promise<unknown> }).executeCommand('room.delete', { roomId: r.id }); }
      catch { /* non-fatal — best-effort clear, exactly as the executor does */ }
    }

    const after = (roomStore as unknown as { getByLevel(l: string): Array<{ id: string }> }).getByLevel(LEVEL);
    const remainingIds = new Set(after.map((r) => r.id));
    clearActuallyRan = seeded === 2 && after.length < seeded ? 1 : 0;
    authoredRoomSurvived = remainingIds.has(authored.id as string) ? 1 : 0;

    lines.push(`(b) LIVE §GRAPH-CLEAR-FIRST over a level holding 1 AUTHORED + 1 generated room → seeded=${seeded} · remaining=${after.length} · the authored room survived=${authoredRoomSurvived === 1}`);

    if (clearActuallyRan !== 1) {
      findingNames.push('(b) the clear loop did not actually remove anything — the arm could not establish its subject, so its verdict about protection means nothing');
    } else if (authoredRoomSurvived !== 1) {
      findingNames.push(
        "(b) THE LIVE DEFECT, REPRODUCED — the §GRAPH-CLEAR-FIRST pattern (HouseLayoutExecutor.ts:1757-1766) DELETED a room whose boundary the user drew (detectionMethod='manual-boundary'). " +
        'The loop reads getByLevel() unfiltered and dispatches room.delete for every id; nothing consults provenance, the deletes are fire-and-forget, the catch is empty, and the user is never told. ' +
        "R8's exit condition names exactly this: the silent room deletion must become a reported, refusable consequence. FIXING IT is a change inside HouseLayoutExecutor.ts — another agent's live territory this session — so it is MEASURED here, not fixed.",
      );
    }
  } catch (e) { harnessErrors.push('(b): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'the clear loop EXECUTED against the REAL store and REAL room.delete (teeth — an arm that deleted nothing proves nothing)', measured: clearActuallyRan, min: 1 });

  // ══ Clause (c) — the REPORTED, REFUSABLE form over the SAME set ═════════════
  let clearRefused = 0; let namesTheAuthored = 0; let carriesCounts = 0; let clearDiscriminates = 0;
  try {
    const authored = mkRoom('Study (drawn by the user)', 'manual-boundary');
    const generated = mkRoom('Room 02', 'auto-topology', 6);
    const plan = planRegenerationClear([authored as never, generated as never], [], 'the house layout generator');

    clearRefused = plan.refuse ? 1 : 0;
    if (!clearRefused) {
      findingNames.push('(c) a clear-set containing an AUTHORED element did not refuse — the decision surface is no safer than the unfiltered loop');
    }
    namesTheAuthored = plan.protected.some((d) => d.id === authored.id) ? 1 : 0;
    if (!namesTheAuthored) {
      findingNames.push('(c) the refusal did not NAME the authored element — a refusal that cannot say what it is protecting cannot be acted on');
    }
    // BOTH NUMBERS, house rule: how many were requested and how many could not be cleared.
    carriesCounts = plan.sentence.includes('2 element(s)') && plan.sentence.includes('1 AUTHORED') ? 1 : 0;
    if (!carriesCounts) {
      findingNames.push(`(c) the refusal sentence lost its counts: "${plan.sentence.slice(0, 160)}"`);
    }

    // CONTROL — the SAME function over an all-system-produced set must NOT refuse, or
    // `refuse` is hard-wired and clause (c) proves nothing.
    const allGenerated = planRegenerationClear(
      [mkRoom('Room 03', 'auto-topology') as never, mkRoom('Room 04', 'ifc-import', 6) as never],
      [], 'the house layout generator',
    );
    clearDiscriminates = allGenerated.refuse === false && allGenerated.clearable.length === 2 ? 1 : 0;

    lines.push(`(c) planRegenerationClear over the SAME set → refuse=${plan.refuse} · clearable=${plan.clearable.length} · PROTECTED=${plan.protected.length} · unknown-authority=${plan.unknownAuthority.length}`);
    lines.push(`(c) sentence: ${plan.sentence.slice(0, 200)}`);
    lines.push(`(c·control) the same function over 2 system-produced rooms → refuse=${allGenerated.refuse} · clearable=${allGenerated.clearable.length} — ` +
      (clearDiscriminates ? 'refusal is a decision, not a constant.' : 'THE CLEAR PLAN DOES NOT DISCRIMINATE (floor).'));
  } catch (e) { harnessErrors.push('(c): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'the refusable clear REFUSES over an authored element (the reported form R8 asks for)', measured: clearRefused, min: 1 });
  floors.push({ what: 'and NAMES the authored element it is protecting', measured: namesTheAuthored, min: 1 });
  floors.push({ what: 'and its sentence carries BOTH counts (requested and un-clearable)', measured: carriesCounts, min: 1 });
  floors.push({ what: 'CONTROL — the SAME function does NOT refuse an all-system-produced set', measured: clearDiscriminates, min: 1 });

  // ══ Clause (d) — already-generated awareness; UNDETERMINED is not [] ════════
  let undeterminedNotEmpty = 0; let determinedWhenDeclared = 0;
  try {
    const present = new Set(['r-1', 'r-2']);
    const noMemory = queryPriorGeneration([], present);
    undeterminedNotEmpty = noMemory.kind === 'undetermined' ? 1 : 0;
    if (!undeterminedNotEmpty) {
      findingNames.push('(d) a generator with NO declared prior run reported a DETERMINED answer — "nothing was generated before" and "we have no way to know" are the same value again, which is the exact defect this loop exists to forbid');
    }

    // CONTROL — with a run declared, the answer must be `determined` and must find the
    // survivor. Otherwise `undetermined` is a stub rather than a reading.
    const declared = queryPriorGeneration(
      [{ generator: 'house-layout', produced: ['r-1', 'r-99'] }], present,
    );
    determinedWhenDeclared = declared.kind === 'determined'
      && declared.stillPresent.includes('r-1') && declared.gone.includes('r-99') ? 1 : 0;

    lines.push(`(d) prior-generation query, no declared run → kind='${noMemory.kind}'` +
      (noMemory.kind === 'undetermined' ? ` reason='${noMemory.reason}'` : '') +
      ` | with a declared run → kind='${declared.kind}'` +
      (declared.kind === 'determined' ? ` stillPresent=[${declared.stillPresent.join(',')}] gone=[${declared.gone.join(',')}]` : '') +
      ` — ${determinedWhenDeclared ? 'undetermined is a reading, not a stub.' : 'THE QUERY DOES NOT DISCRIMINATE (floor).'}`);

    // A NAMED FINDING: the awareness is caller-declared, not persisted. It survives no
    // reload, so a re-run in a fresh session has no awareness at all — which is the
    // duplicate-on-rerun defect R8 names, still open.
    findingNames.push(
      '(d) ALREADY-GENERATED AWARENESS IS NOT PERSISTED — no element carries a generation marker (generationId / generatedBy / isGenerated / sourceGenerator: 0 first-party hits, measured 2026-08-12), ' +
      'so awareness exists only for a caller that declares its own prior run in-process. A generator re-run in a fresh session has NONE. ' +
      'Measured consequence in HouseLayoutExecutor: fresh levels are minted per run with Date.now()+Math.random() ids and only ROOMS are cleared — walls, doors, windows, slabs, stairs, roofs, furniture and lighting from a previous run are never removed, so a second run stacks a whole building on the first. Closing this is the roadmap Phase 8 element field.',
    );
  } catch (e) { harnessErrors.push('(d): ' + String(e).slice(0, 300)); }
  floors.push({ what: 'UNDETERMINED is returned when nothing can be known (never an empty determined set)', measured: undeterminedNotEmpty, min: 1 });
  floors.push({ what: 'CONTROL — a DECLARED run yields `determined` and finds the survivor', measured: determinedWhenDeclared, min: 1 });

  // ══ Clause (e) — the unreachable verifications, PRINTED as unreachable ══════
  // E3's lesson: an arm that cannot be honestly evaluated says it is not evaluated, with
  // the reason. Four of review §6's seven verifications have no subject at HEAD.
  const NOT_EVALUATED: { verification: string; why: string; closedBy: string }[] = [
    {
      verification: 'authored wall byte-intact after regeneration',
      why: 'no wall carries provenance — every `origin:` in packages/schemas/src/elements/Wall.ts is a geometric Vec3, so an authored wall is INDISTINGUISHABLE from a generated one at HEAD',
      closedBy: 'roadmap Phase 8 — a ValueProvenance field on the element schemas (C75 §3 coverage ratchet)',
    },
    {
      verification: 'authored opening byte-intact · generated opening revalidated',
      why: 'doors and windows carry no provenance either, and there is no regeneration pass over openings to run',
      closedBy: 'roadmap Phase 8 field + a `*.regenerate` verb (none exists: only GENERATE_STAIR_GEOMETRY and ai.floorplan.generate, neither of which regenerates an area)',
    },
    {
      verification: 'generated wall UPDATED (not merely left alone) by the regeneration',
      why: 'there is no regeneration verb to run — the house/apartment generators are UI controllers, not bus verbs, so no command can be dispatched and read back',
      closedBy: 'a `*.regenerate` bus verb consuming the ConsequencePlan (the golden matrix\'s room.regenerate row, R9+)',
    },
    {
      verification: 'the AI-proposed element is still marked INFERRED afterwards',
      why: 'no AI-proposed element persists an origin. ai.floorplan.generate stamps nothing on what it creates, and R7 already measured that no production call site builds a CommandExecutionContext at all',
      closedBy: 'roadmap Phase 8 field + ADR-0324 envelope wiring (R7\'s declared finding)',
    },
  ];
  for (const n of NOT_EVALUATED) {
    lines.push(`(e) NOT EVALUATED — ${n.verification}`);
    lines.push(`      why: ${n.why}`);
    lines.push(`      closed by: ${n.closedBy}`);
    findingNames.push(`(e) NOT EVALUATED — ${n.verification}: ${n.why}`);
  }
  // The list is asserted as a COUNT so it cannot quietly shrink to flatter the gate. If a
  // substrate lands and an arm becomes evaluable, this floor must be LOWERED deliberately,
  // in the commit that adds the real arm.
  floors.push({
    what: 'the unreachable verifications are ENUMERATED (an honest gate names what it cannot see)',
    measured: NOT_EVALUATED.length, min: 4,
  });

  lines.push(`(e) SCENARIO COVERAGE: 3 of review §6's 7 verifications are EXECUTED (authored protected · system-produced clearable · a report naming which and why); 4 are NOT EVALUATED for want of substrate. This gate does NOT claim the scenario passes.`);

  for (const err of harnessErrors) {
    lines.push('harness error: ' + err);
    findingNames.push('harness error (never merged with "no change"): ' + err.slice(0, 120));
  }

  return {
    gate: 'check-authored-state-protection',
    floors,
    lines,
    findings: findingNames.length,
    // NEWLY MEASURED, pinned in tools/ga-gate/gate-newly-measured.json. E-13's own words:
    // "It should be named now, RED, per the roadmap's own §0.1 rule (a gate lands before its
    // implementation, and lands RED)." The declared level is the count of findings that
    // PREDATE this gate; it is SHRINK-ONLY and every entry names its exit condition.
    // MEASURED 2026-08-12 = 7: (a) PV-01's live ambiguity · (b) the authored room destroyed
    // by the live clear pattern · (d) generation awareness not persisted · (e) FOUR
    // verifications with no substrate. Each is enumerated with its exit condition in
    // gate-newly-measured.json.
    declared: 7,
    findingNames,
  };
}

run()
  .then((r) => process.exit(reportGate(r)))
  .catch((e) => {
    console.error('check-authored-state-protection: harness threw — MISCONFIGURED\n', e);
    process.exit(2);
  });
