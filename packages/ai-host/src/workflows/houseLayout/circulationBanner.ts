// §CI-1-BANNER (SPEC-49 §4 CI-1) — THE HOUSE STOREY CIRCULATION VERDICT AND THE
// BLOCKING BANNER THAT NAMES THE SEALED ROOMS.
//
// PURE L2: zero I/O, zero THREE, zero DOM. It reads `LayoutOption.circulation` (the
// §CI-0 block the engine now carries across the emit boundary) and projects it into a
// per-storey verdict plus a house-scale banner payload a UI can render verbatim.
//
// ───────────────────────── THE DECISION THIS ENCODES ─────────────────────────
// Founder, 2026-08-13. When every candidate layout for a house storey is HARD-INVALID
// (a room is sealed — unreachable and/or doorless), PRYZM **ships the least-bad storey
// AND raises a blocking banner naming the sealed rooms and the failed rule.**
//
//   - It does NOT refuse the storey. The orchestrator requires every storey to produce
//     a layout; emptying one mid-stack is a bigger change than it looks. The engine
//     already cannot refuse here anyway: `enumerate.ts:2911` sets `isHousePath =
//     input.envelopeValidator !== undefined`, always true for a house storey because
//     the orchestrator always injects `validateHouseStorey`, and `:2912` guards the
//     structured rejection on `!isHousePath`.
//   - It does NOT ship silently. That was explicitly ruled out. Before this module the
//     ENTIRE user-facing behaviour was `enumerate.ts:2945`'s console.warn
//     `§TOPO-HARD-REJECT-ALL … Surface the failing rule(s) to the user.` — an
//     instruction addressed to a consumer that did not exist.
//
// ⚠ THIS MODULE STILL MAKES NO DECISION ABOUT GEOMETRY. It changes nothing about which
// option ships. It only stops the verdict being thrown away between the engine and the
// user. The layout you get is byte-for-byte the layout you got before.
//
// ─────────────────── THE STANDARD IT IS WRITTEN TO (three states) ───────────────────
// The envelope panel is production's one correct precedent: "within the limits that
// could be checked · indicative only, not a compliance determination · NO LIMIT SET".
// Three different states, NONE of them collapsed into a reassuring default. So here:
//
//   sound         — measured, and every hard rule passed.
//   sealed        — measured, and a room is unreachable and/or has no door at all.
//                   BLOCKING. The founder's case.
//   unsound       — measured, a hard rule failed, but no room came back sealed
//                   (e.g. a window/area rule, a served-through room, a corridor that
//                   never meets the stair). NOT "sound" — a real defect, lower severity.
//   not-measured  — NO VERDICT EXISTS. `undefined` means NOT MEASURED, never "sound"
//                   (C70 §2.2). This is the state that gets quietly written as a pass,
//                   and it is the reason `status` has no default branch that returns
//                   'sound'. Every not-measured verdict carries a REASON.
//
// ⚠ THE THREE ROOM SETS ARE THREE DIFFERENT QUESTIONS AND ARE NEVER MERGED (C75 §1.2 —
// two distinct facts must never print the same value). See `LayoutCirculationVerdict`
// in `apartmentLayout/types.ts` for why. `doorlessRoomNames` is the set the founder
// actually saw in the browser; `unreachableRoomNames` is the BFS answer; the
// served-through set is neither. They are carried side by side and rendered side by
// side, with their own labels.
//
// ⚠ A ROOM WE CANNOT NAME IS STILL A ROOM THAT IS SEALED. §CI-0 already resolves an
// unresolvable id to the id itself rather than dropping it; this module never filters,
// truncates or de-duplicates those lists, because a silently shortened list understates
// the defect.

import type { LayoutOption, LayoutRoom } from '../apartmentLayout/types.js';

// ─────────────────── §BUILT-PLAN-REACH — the fourth question ───────────────────
//
// ⚠ THE ENGINE'S VERDICT IS NOT SUFFICIENT FOR THIS BANNER, AND THAT IS A MEASUREMENT,
// NOT AN OPINION. A 10×8 m 2-bed house, storey 1, at HEAD:
//
//   realised door graph:  Corridor↔{Bathroom, Bedroom 1, Bedroom 2, Stair, Storage,
//                                   Storage 4}
//                         Storage 2 ↔ Storage 3      ← an ISLAND. Each has a door.
//                                                      Neither door leads anywhere else.
//   engine verdict:       hardValid: TRUE, and ALL FIVE room sets EMPTY.
//
// You cannot walk to `Storage 2` or `Storage 3`. The engine says the storey is clean.
// It is not lying: every hard rule it evaluates runs on the BUBBLE GRAPH, and the
// residual-fill pass mints these rooms AFTER that graph exists, so no rule ever sees
// them. `hardValid` is a claim about the rooms the engine planned, not about the rooms
// that shipped. `doorlessRoomIds` does not catch them either — an island of two is not
// doorless, it is unreachable, and those are different questions (C75 §1.2).
//
// So a banner built ONLY on `option.circulation` would print "sound" over a storey with
// two rooms the founder can see are sealed. That is the §CONTEXT-DATA-HONESTY failure
// this whole SPEC exists to close, reproduced inside the fix for it.
//
// We therefore measure reachability HERE, on the REALISED door graph — the graph the
// user actually walks. SPEC-49 §5 names this precisely: the only implementation of "is
// every room reachable" lives at L7 in `apps/editor/.../layoutBubbleGraph.ts`, so "the
// engine cannot call the invariant that judges it, and the invariant can only ever be a
// display value — never a gate". This function is that invariant, at L2, where the
// generator can reach it. It is a FOURTH set, carried beside the engine's three and
// never merged into them.

/** Mirrors REACH_CIRCULATION_TYPES in `layoutBubbleGraph.ts` — the spine, not destinations. */
const CIRCULATION_TYPES: ReadonlySet<string> =
    new Set(['corridor', 'hall', 'stair', 'landing', 'lobby']);
/** Mirrors REACH_SERVED_WITHIN — served within a parent, so not a circulation destination. */
const SERVED_WITHIN: ReadonlySet<string> =
    new Set(['ensuite', 'enSuite', 'closet', 'wardrobe', 'walkin']);

export interface BuiltPlanReach {
    /** Rooms the REALISED door graph cannot reach from the entrance, by name, in sorted
     *  order. Never truncated, never de-duplicated by name. */
    readonly strandedRoomNames: readonly string[];
    /** false ⇒ at least one room carries no `doorAdjacentTo` array, so the BFS fell back
     *  to WALL ADJACENCY, which INFLATES reachability. A clean result under this flag is
     *  not evidence of anything and must not be reported as sound. */
    readonly measuredOnDoorGraph: boolean;
}

/**
 * §BUILT-PLAN-REACH — BFS over the REALISED door graph. A faithful port of the L7
 * predicate `computeCirculationReachability` (SPEC-CIRCULATION-GRAPH §9.2), including
 * §DUP-NAME-SAFE index keying (the residual fill mints several rooms with the IDENTICAL
 * display name, and a name-keyed graph collapses distinct rooms — the exact mechanism by
 * which a sealed room inherits a same-named sibling's connectivity and reads as
 * reachable, L-869) and the §ROOT-CORRIDOR-BEFORE-STAIR root order.
 *
 * Pure + deterministic.
 */
export function builtPlanReach(option: LayoutOption): BuiltPlanReach {
    const rooms = (option.rooms ?? []).filter(
        (r): r is LayoutRoom => !!r && typeof r.name === 'string' && r.name.length > 0,
    );
    const measuredOnDoorGraph = rooms.length > 0 && rooms.every(r => Array.isArray(r.doorAdjacentTo));
    const typeOf = (r: LayoutRoom): string => String(r.type ?? '').toLowerCase();
    const isCirc = (t: string): boolean => CIRCULATION_TYPES.has(t);
    const isDestination = (r: LayoutRoom): boolean =>
        !isCirc(typeOf(r)) && !SERVED_WITHIN.has(typeOf(r));
    const destinations = rooms.filter(isDestination);
    if (destinations.length === 0) return { strandedRoomNames: [], measuredOnDoorGraph };

    // §DUP-NAME-SAFE — key by ARRAY INDEX; resolve a referenced name to ALL rooms bearing it.
    const idxByName = new Map<string, number[]>();
    rooms.forEach((r, i) => {
        const a = idxByName.get(r.name); if (a) a.push(i); else idxByName.set(r.name, [i]);
    });
    const adj: number[][] = rooms.map(() => []);
    rooms.forEach((r, i) => {
        for (const n of ((measuredOnDoorGraph ? r.doorAdjacentTo : r.adjacentTo) ?? [])) {
            if (typeof n !== 'string') continue;
            for (const j of (idxByName.get(n) ?? [])) {
                if (j === i) continue;
                adj[i]!.push(j); adj[j]!.push(i);      // undirected (robust to one-sided data)
            }
        }
    });
    // §ROOT-CORRIDOR-BEFORE-STAIR — hall → corridor → stair → any circulation → first room.
    const sorted = rooms.map((r, i) => ({ r, i }))
        .sort((a, b) => (a.r.name < b.r.name ? -1 : a.r.name > b.r.name ? 1 : a.i - b.i));
    const root = sorted.find(x => typeOf(x.r) === 'hall')
        ?? sorted.find(x => typeOf(x.r) === 'corridor')
        ?? sorted.find(x => typeOf(x.r) === 'stair')
        ?? sorted.find(x => isCirc(typeOf(x.r)))
        ?? sorted[0]!;
    const seen = new Set<number>([root.i]); const queue = [root.i];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of (adj[cur] ?? []).slice().sort((x, y) => x - y)) {
            if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
        }
    }
    const stranded: string[] = [];
    rooms.forEach((r, i) => { if (isDestination(r) && !seen.has(i)) stranded.push(r.name); });
    stranded.sort();
    return { strandedRoomNames: stranded, measuredOnDoorGraph };
}

/** Per-storey circulation state. There is deliberately NO fifth value and no default
 *  that lands on 'sound' — see the header. */
export type StoreyCirculationStatus = 'sound' | 'sealed' | 'unsound' | 'not-measured';

/** WHY a storey could not be judged. Two DISTINCT facts, never printed as one value
 *  (C75 §1.2): the storey shipped no layout at all, vs it shipped a layout that never
 *  went through the deterministic engine and therefore carries no verdict. */
export type NotMeasuredReason = 'no-layout-for-storey' | 'engine-verdict-absent';

/** Banner severity, worst-first. `blocking` ⇒ at least one storey ships SEALED.
 *  `unknown` ⇒ nothing measured as sealed but at least one storey could not be judged
 *  — which is NOT the same as clean. `advisory` ⇒ a measured hard-rule failure with no
 *  sealed room. */
export type BannerSeverity = 'blocking' | 'unknown' | 'advisory';

/** What the report needs about ONE storey. `option` is the layout that SHIPPED for that
 *  storey (`HouseLayoutResult.perStoreyLayout[i]`), or null when the plate produced
 *  none. `optionCount` is how many candidates the engine returned for the storey — it
 *  distinguishes "the engine had nothing to offer" from "the selector took none". */
export interface StoreyCirculationInput {
    readonly storeyIndex: number;
    readonly levelId: string;
    readonly option: LayoutOption | null;
    readonly optionCount: number;
}

/** The verdict for ONE storey. Every room list is carried in full, by NAME, with the
 *  three sets kept apart. */
export interface StoreyCirculationVerdict {
    readonly storeyIndex: number;
    readonly levelId: string;
    readonly status: StoreyCirculationStatus;
    /** Present iff `status === 'not-measured'`. */
    readonly notMeasuredReason?: NotMeasuredReason;
    /** Present iff `status === 'not-measured'` — a sentence a user can read. */
    readonly notMeasuredDetail?: string;
    /** WHICH hard rules the engine says failed. Empty when the option was hard-valid,
     *  and empty (not "none failed") when nothing was measured. */
    readonly failedRules: readonly string[];
    /** SEALED by BFS from the entrance — may still HOLD a door if every route in is
     *  itself sealed. */
    readonly unreachableRoomNames: readonly string[];
    /** NO DOOR ONTO CIRCULATION — reachable only THROUGH another room. Distinct from
     *  both other sets; a served-through bedroom is here and in neither of the others. */
    readonly unroutedToCirculationRoomNames: readonly string[];
    /** NO DOOR AT ALL, from the REALISED door graph. The set the founder saw. */
    readonly doorlessRoomNames: readonly string[];
    /** §BUILT-PLAN-REACH — rooms the REALISED door graph cannot reach from the entrance.
     *  A FOURTH question, measured here rather than by the engine, because the engine's
     *  `unreachableRoomNames` is computed on the bubble graph and is structurally blind
     *  to residual-fill rooms (see the module header's 10×8 m measurement). Never merged
     *  with the engine's set — they answer different questions on different graphs, and
     *  they disagree in production. */
    readonly strandedRoomNames: readonly string[];
    /** §CI-4 — the corridor shares no door-width wall with the stair keep-out. */
    readonly corridorStairGap: boolean;
    /** §CI-4 — the ground-floor twin: no door-width wall shared with the entrance hall. */
    readonly corridorHallGap: boolean;
    /** §SPINE-SEVERED — true when the circulation spine is broken, which means the room
     *  lists above are KNOWN to be incomplete: the engine's reachability BFS ran on the
     *  bubble graph, where the stair is a circulation root, so rooms stranded behind the
     *  break are not in `unreachableRoomNames`. A UI must not present the lists as
     *  exhaustive when this is true. False does NOT prove the lists are exhaustive — it
     *  only means this particular known cause of understatement is absent. */
    readonly roomListUnderstates: boolean;
    /** One rendered line for this storey, ready to display. Empty for a sound storey. */
    readonly line: string;
}

/** The house-scale banner. Null when every storey measured SOUND — and only then. */
export interface HouseCirculationBanner {
    readonly severity: BannerSeverity;
    /** One sentence naming EVERY non-clean bucket that is non-empty. A blocking banner
     *  that mentions only the sealed storeys would imply the unmeasured ones were fine. */
    readonly headline: string;
    /** The envelope-panel-style honesty qualifier: what was checked, what this is not. */
    readonly qualifier: string;
    /** The storeys that ship with a sealed room. */
    readonly sealedStoreys: readonly StoreyCirculationVerdict[];
    /** The storeys that failed a hard rule WITHOUT a sealed room. */
    readonly unsoundStoreys: readonly StoreyCirculationVerdict[];
    /** The storeys that could not be judged at all. NOT a pass. */
    readonly notMeasuredStoreys: readonly StoreyCirculationVerdict[];
    /** The union of every failed rule across every measured storey, sorted, de-duped.
     *  De-duping RULES is safe (a rule is a rule); de-duping ROOMS is not, and is not
     *  done anywhere in this module. */
    readonly failedRules: readonly string[];
    /** One line per non-sound storey, in storey order — `sealedStoreys` etc. carry the
     *  same verdicts structurally, this is the pre-rendered text. */
    readonly lines: readonly string[];
}

/** The accumulated house verdict. `storeys` is STRICTLY index-aligned with
 *  `HouseLayoutResult.storeys`, one entry per plate, including the blank ones. */
export interface HouseCirculationReport {
    readonly storeys: readonly StoreyCirculationVerdict[];
    readonly storeysTotal: number;
    readonly storeysSound: number;
    readonly storeysSealed: number;
    readonly storeysUnsound: number;
    readonly storeysNotMeasured: number;
    readonly banner: HouseCirculationBanner | null;
}

const list = (names: readonly string[]): string => names.join(', ');

/** Render the human line for a non-sound storey. The three room sets get three
 *  DIFFERENT labels so a reader cannot mistake one for another. */
function renderLine(v: Omit<StoreyCirculationVerdict, 'line'>): string {
    const head = `Storey ${v.storeyIndex} (${v.levelId})`;
    if (v.status === 'not-measured') {
        return `${head}: NOT MEASURED — ${v.notMeasuredDetail ?? 'no circulation verdict exists for this storey.'}`;
    }
    if (v.status === 'sound') return '';
    const parts: string[] = [];
    if (v.doorlessRoomNames.length > 0) parts.push(`no door at all: ${list(v.doorlessRoomNames)}`);
    // §BUILT-PLAN-REACH first among the reach answers: it is the one measured on the doors
    // that actually shipped, so it is the one the user can verify by walking the plan.
    if (v.strandedRoomNames.length > 0) {
        parts.push(`cannot be reached from the entrance in the BUILT plan: ${list(v.strandedRoomNames)}`);
    }
    if (v.unreachableRoomNames.length > 0) {
        parts.push(`unreachable per the engine's own plan graph: ${list(v.unreachableRoomNames)}`);
    }
    if (v.unroutedToCirculationRoomNames.length > 0) {
        parts.push(`no door onto circulation (served through another room): ${list(v.unroutedToCirculationRoomNames)}`);
    }
    if (v.corridorStairGap) parts.push('the corridor does not meet the stair');
    if (v.corridorHallGap) parts.push('the corridor does not meet the entrance hall');
    if (v.failedRules.length > 0) parts.push(`rules failed: ${list(v.failedRules)}`);
    // §SPINE-SEVERED — say that the list is short. Do not print a short list as complete.
    if (v.roomListUnderstates) {
        parts.push(
            'the circulation spine is broken, so anything reachable ONLY through the far side '
            + 'is cut off too — the rooms named above are NOT the whole list',
        );
    }
    const label = v.status === 'sealed' ? 'SEALED' : 'UNSOUND';
    return `${head}: ${label} — ${parts.join(' · ')}`;
}

/**
 * Judge ONE storey. The ONLY place `status` is decided.
 *
 * ⚠ Read the two `not-measured` branches before changing anything here. Neither may
 * ever fall through to 'sound': an absent verdict is an absence of knowledge, and the
 * whole point of this module is that PRYZM stops reporting absence as health.
 */
export function judgeStoreyCirculation(input: StoreyCirculationInput): StoreyCirculationVerdict {
    const base = {
        storeyIndex: input.storeyIndex,
        levelId: input.levelId,
        failedRules: [] as readonly string[],
        unreachableRoomNames: [] as readonly string[],
        unroutedToCirculationRoomNames: [] as readonly string[],
        doorlessRoomNames: [] as readonly string[],
        strandedRoomNames: [] as readonly string[],
        corridorStairGap: false,
        corridorHallGap: false,
        // NOT-MEASURED storeys carry empty lists, and an empty list is not a short list —
        // the `notMeasuredReason` already says nothing was measured. Understatement is a
        // claim about a MEASURED list, so it is false here rather than vacuously true.
        roomListUnderstates: false,
    };

    // (1) NO LAYOUT. The plate produced nothing, so there is nothing to judge. This is
    //     NOT "clean" — an absent storey is an absent storey.
    if (!input.option) {
        const partial: Omit<StoreyCirculationVerdict, 'line'> = {
            ...base,
            status: 'not-measured',
            notMeasuredReason: 'no-layout-for-storey',
            notMeasuredDetail:
                `this storey shipped no layout at all (the engine returned ${input.optionCount} candidate`
                + `${input.optionCount === 1 ? '' : 's'}), so its circulation was never evaluated. `
                + 'This is not a pass.',
        };
        return { ...partial, line: renderLine(partial) };
    }

    // (2) A LAYOUT WITH NO VERDICT. An AI-produced or hand-built option never went
    //     through `enumerate.ts` and carries no §CI-0 block. `undefined` means NOT
    //     MEASURED, never "sound" (C70 §2.2). THIS IS THE BRANCH MOST LIKELY TO BE
    //     WRITTEN AS A PASS BY MISTAKE.
    const c = input.option.circulation;
    const reach = builtPlanReach(input.option);
    if (!c) {
        // We can still walk the REALISED door graph even with no engine verdict, so we
        // report what that shows rather than pretending we know nothing. But the STATUS
        // stays 'not-measured': the hard rules genuinely were never evaluated, and a
        // clean door graph is not a substitute for them. Report what could be checked;
        // do not upgrade it into a pass.
        const partial: Omit<StoreyCirculationVerdict, 'line'> = {
            ...base,
            status: 'not-measured',
            notMeasuredReason: 'engine-verdict-absent',
            strandedRoomNames: reach.strandedRoomNames,
            roomListUnderstates: !reach.measuredOnDoorGraph,
            notMeasuredDetail:
                'this storey shipped a layout that carries no circulation verdict — it did not come '
                + 'from the deterministic layout engine, so no hard rule was ever evaluated against it. '
                + 'This is not a pass. '
                + (reach.strandedRoomNames.length > 0
                    ? `Walking the doors that DID ship, these rooms cannot be reached from the entrance: ${list(reach.strandedRoomNames)}.`
                    : reach.measuredOnDoorGraph
                        ? 'Walking the doors that DID ship, every room is reachable — but that is one check, not the rule set.'
                        : 'Its rooms carry no door graph, so not even reachability could be checked.'),
        };
        return { ...partial, line: renderLine(partial) };
    }

    // (3) MEASURED. The three room sets stay apart; nothing is filtered or truncated.
    //
    // §SPINE-SEVERED — A SEVERED SPINE IS A SEALED STOREY, AND IT ALSO INVALIDATES THE
    // ENGINE'S OWN REACHABLE-ROOM LIST. Measured, not argued (12×10 m, 2-bed, storey 1):
    //
    //   realised door graph: Corridor↔{Bathroom, Bedroom 1, Bedroom 2, Master Bedroom}
    //                        Stair↔Storage 3          ← a SECOND, DISCONNECTED component
    //   engine verdict:      unreachableRoomIds: []   corridorStairGap: true
    //
    // `Storage 3` cannot be walked to from the entrance — you would have to reach the
    // stair, and the corridor never meets it. The engine still reports NO unreachable
    // room because that BFS runs on the BUBBLE GRAPH before emission, where the stair is
    // itself a circulation ROOT; the break that isolates it is recorded in a DIFFERENT
    // field. So on a spine-severed storey the empty `unreachableRoomNames` is not
    // evidence of soundness — it is a measurement taken on a graph that is not the one
    // that shipped ([[probe-can-be-wrong-three-ways]]: right property, wrong RUNTIME).
    //
    // We therefore (a) classify a severed spine as SEALED, and (b) say IN THE LINE that
    // the room list is known to understate. We do NOT invent the missing room names: the
    // realised-graph BFS is the L7-only predicate SPEC-49 §5 flags as living on the wrong
    // side of the boundary, and a list we fabricated here would be a third opinion, not a
    // measurement. Naming a shortfall we cannot enumerate beats printing a short list as
    // if it were complete.
    const spineSevered = c.corridorStairGap || c.corridorHallGap;
    const sealed = c.unreachableRoomNames.length > 0
        || c.doorlessRoomNames.length > 0
        || reach.strandedRoomNames.length > 0      // §BUILT-PLAN-REACH — the set the engine cannot see
        || spineSevered;
    const otherDefect = !c.hardValid || c.unroutedToCirculationRoomNames.length > 0;
    const status: StoreyCirculationStatus = sealed ? 'sealed' : otherDefect ? 'unsound' : 'sound';
    // A SEALED storey must always be able to name a rule, because the founder asked for
    // "the failed rule" and not only the rooms. The engine names one in every measured
    // case we have; when it somehow does not, we say so IN THE RULE LIST rather than
    // print an empty one, which would read as "no rule failed".
    // ⚠ `hardValid: true` alongside a stranded room is not a contradiction we may hide.
    // It is the measured state of the 10×8 m case in the header: the engine evaluated
    // every rule it has, on the rooms it planned, and the rooms that stranded were minted
    // afterwards. We name the rule that FAILED IN THE BUILT PLAN, and we name where the
    // judgement came from, so nobody reads it as a rule the engine reported.
    const failedRules = reach.strandedRoomNames.length > 0 && c.hardFailedRules.length === 0
        ? ['built-plan-reach (failed in the SHIPPED door graph; the engine\'s own rules all passed)']
        : c.hardFailedRules.length > 0
            ? c.hardFailedRules
            : (sealed ? ['reach (rule not named by the engine)'] : c.hardFailedRules);
    const partial: Omit<StoreyCirculationVerdict, 'line'> = {
        storeyIndex: input.storeyIndex,
        levelId: input.levelId,
        status,
        failedRules,
        unreachableRoomNames: c.unreachableRoomNames,
        unroutedToCirculationRoomNames: c.unroutedToCirculationRoomNames,
        doorlessRoomNames: c.doorlessRoomNames,
        strandedRoomNames: reach.strandedRoomNames,
        corridorStairGap: c.corridorStairGap,
        corridorHallGap: c.corridorHallGap,
        // A severed spine strands rooms the engine's list omits; a missing door graph
        // means the reach BFS fell back to wall adjacency, which INFLATES reachability.
        // Either way the lists above are short and must not be shown as exhaustive.
        roomListUnderstates: spineSevered || !reach.measuredOnDoorGraph,
    };
    return { ...partial, line: renderLine(partial) };
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** Compose the headline. It names EVERY non-empty bucket: a blocking headline that
 *  mentions only the sealed storeys would imply the unmeasured ones were fine, which is
 *  the exact reassuring-default failure this module exists to prevent. */
function renderHeadline(
    total: number, sealed: number, unsound: number, notMeasured: number,
): string {
    const clauses: string[] = [];
    if (sealed > 0) {
        clauses.push(
            `${sealed} of ${total} ${plural(total, 'storey', 'storeys')} ships with a sealed room `
            + '(a room with no door, or one the entrance cannot reach)',
        );
    }
    if (unsound > 0) {
        clauses.push(
            `${unsound} ${plural(unsound, 'storey', 'storeys')} failed a hard circulation rule `
            + 'without sealing a room',
        );
    }
    if (notMeasured > 0) {
        clauses.push(
            `${notMeasured} ${plural(notMeasured, 'storey', 'storeys')} could not be checked at all `
            + '— NOT MEASURED, which is not the same as sound',
        );
    }
    return `${clauses.join('; ')}.`;
}

/**
 * Accumulate the per-storey verdicts into the house report + banner.
 *
 * The banner is null IF AND ONLY IF every storey measured SOUND. A single unmeasured
 * storey is enough to raise one, because an unmeasured storey that raises nothing is
 * indistinguishable — to the user — from a storey that passed.
 *
 * Pure + deterministic. Input order is preserved; nothing is sorted, filtered or
 * de-duplicated except the RULE union (rules are interchangeable; rooms are not).
 */
export function buildHouseCirculationReport(
    inputs: readonly StoreyCirculationInput[],
): HouseCirculationReport {
    const storeys = inputs.map(judgeStoreyCirculation);
    const sealedStoreys = storeys.filter(v => v.status === 'sealed');
    const unsoundStoreys = storeys.filter(v => v.status === 'unsound');
    const notMeasuredStoreys = storeys.filter(v => v.status === 'not-measured');
    const storeysSound = storeys.filter(v => v.status === 'sound').length;

    const report = {
        storeys,
        storeysTotal: storeys.length,
        storeysSound,
        storeysSealed: sealedStoreys.length,
        storeysUnsound: unsoundStoreys.length,
        storeysNotMeasured: notMeasuredStoreys.length,
    };

    if (sealedStoreys.length === 0 && unsoundStoreys.length === 0 && notMeasuredStoreys.length === 0) {
        return { ...report, banner: null };
    }

    // Worst severity wins the RANK, but every bucket is still carried and named — the
    // rank decides how loudly the UI shouts, never what it hides.
    const severity: BannerSeverity =
        sealedStoreys.length > 0 ? 'blocking'
        : notMeasuredStoreys.length > 0 ? 'unknown'
        : 'advisory';

    const failedRules = Array.from(
        new Set(storeys.flatMap(v => v.failedRules)),
    ).sort();

    const measured = storeys.length - notMeasuredStoreys.length;
    const qualifier =
        `Checked ${measured} of ${storeys.length} ${plural(storeys.length, 'storey', 'storeys')} · `
        + 'the layout was generated and SHIPPED anyway — this is a warning about what was built, '
        + 'not a refusal to build it · a storey listed as NOT MEASURED has not been judged sound.';

    return {
        ...report,
        banner: {
            severity,
            headline: renderHeadline(
                storeys.length, sealedStoreys.length, unsoundStoreys.length, notMeasuredStoreys.length,
            ),
            qualifier,
            sealedStoreys,
            unsoundStoreys,
            notMeasuredStoreys,
            failedRules,
            lines: storeys.filter(v => v.line.length > 0).map(v => v.line),
        },
    };
}
