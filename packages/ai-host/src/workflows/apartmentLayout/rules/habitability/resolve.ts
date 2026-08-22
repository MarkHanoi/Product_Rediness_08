// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL — THE RESOLUTION LADDER (L-4403).
//
// `(jurisdiction, roomType) -> { minAreaM2, minShortSideM, provenance, confidence }`
//
// THE LADDER, FINEST FIRST
// ══════════════════════════════════════════════════════════════════════════════════
//   1. `binding.jurisdictionId`  — the registered zoning jurisdiction the ONE existing
//                                  resolver returned for the parcel ('es-29067-malaga').
//   2. `binding.regionKey`       — a sub-national key the caller could name ('es-ct').
//   3. `binding.countryCode`     — ISO alpha-2 ('gb'), for country-tier instruments.
//   4. `PRYZM_BASELINE`          — THE ONE FALLBACK. Named, never silent.
//
// ⭐ **THE LADDER IS APPLIED PER FIELD, NOT PER ROOM**, and that is a deliberate legal
// choice rather than an implementation convenience. A municipal ordinance can state a
// bedroom AREA and be silent on its WIDTH while the regional decree states the width;
// under a per-ROOM rule the municipal silence would knock the real regional width out
// and substitute a PRYZM default — a regulation lost to a default, which is the
// permissive-direction error this whole module exists to refuse. Each field therefore
// takes the finest instrument that actually states it, and each carries its OWN
// provenance, which is why `ResolvedRoomMinimum` has two.
//
// ⛔ THERE IS NO INTERPOLATION ANYWHERE ON THIS PATH. A room type no instrument in the
// chain addresses does not get a neighbouring country's number, an average, or a
// "similar jurisdiction" — it gets the named PRYZM baseline with `areaIsRegulated:
// false`, and every sentence built from it says so.
//
// WHERE THE JURISDICTION COMES FROM (and why it is not resolved here)
// ══════════════════════════════════════════════════════════════════════════════════
// PRYZM already has exactly one geography resolver:
// `resolveRegisteredJurisdictionAt(lat, lon)` in
// `@pryzm/site-parcel-data/rulepacks/registry.ts`, with the §JURISDICTION-SPECIFICITY
// finest-claim-wins rule and an explicit `'ambiguous'` arm that REFUSES rather than
// picking. Minting a second one here would be the defect this repo keeps paying for
// (ADR-0352 §4), and importing it would drag 40+ zoning rule packs into the layout
// engine and break this module's purity. So the composition surface resolves, and
// this module consumes a plain-string {@link HabitabilityBinding}.
//
// PURE. No I/O, no clock, no RNG. Deterministic for a given binding.

import type { RoomType } from '../../types.js';
import { HABITABILITY_STANDARDS, PRYZM_BASELINE } from './standards.js';
import type {
    HabitabilityBinding,
    HabitabilityMatchTier,
    HabitabilityStandard,
    ResolvedRoomMinimum,
    RoomMinimum,
    RoomMinimumProvenance,
} from './types.js';

/** A rung: the standards that answer for one key, and which rung it was. */
interface Rung {
    readonly tier: HabitabilityMatchTier;
    readonly standards: readonly HabitabilityStandard[];
}

const norm = (s: string | null | undefined): string | null => {
    if (typeof s !== 'string') return null;
    const t = s.trim().toLowerCase();
    return t.length > 0 ? t : null;
};

function standardsForKey(key: string): readonly HabitabilityStandard[] {
    return HABITABILITY_STANDARDS.filter((s) =>
        s.jurisdictionKeys.some((k) => k.toLowerCase() === key),
    );
}

/**
 * The ordered chain of standards that speak for this binding, finest first.
 * EXPORTED because the disclosure surfaces need to name what DID and did NOT match,
 * and re-deriving that at the UI would be a second copy of this rule.
 */
export function habitabilityChain(binding?: HabitabilityBinding | null): readonly Rung[] {
    if (!binding) return [];
    const rungs: Rung[] = [];
    const jid = norm(binding.jurisdictionId);
    const region = norm(binding.regionKey);
    const cc = norm(binding.countryCode);
    if (jid) rungs.push({ tier: 'jurisdiction', standards: standardsForKey(jid) });
    if (region) rungs.push({ tier: 'region', standards: standardsForKey(region) });
    if (cc) rungs.push({ tier: 'country', standards: standardsForKey(cc) });
    return rungs.filter((r) => r.standards.length > 0);
}

/** The baseline's entry for a room type. The baseline is exhaustive over RoomType by
 *  construction (it is derived from `ROOM_RULES`), but this stays total anyway so an
 *  unknown string can never produce `undefined` arithmetic downstream. */
function baselineFor(type: RoomType): RoomMinimum {
    const r = (PRYZM_BASELINE.rooms as Partial<Record<string, RoomMinimum>>)[type];
    if (r) return r;
    // Unreachable for a real RoomType. Kept total, and kept UNKNOWN rather than 0 —
    // a fabricated 0 would read as "no minimum", which is a claim.
    return {
        minAreaM2: null,
        minShortSideM: null,
        provenance: {
            instrument: 'PRYZM engineering baseline — NOT a regulation of any country.',
            article: null,
            instrumentDate: '2026-08-22',
            sourcePath: 'packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts',
            sourceToChase: 'Add this room type to ROOM_RULES.',
            confidence: 'pryzm-default',
            bindingness: 'guidance',
        },
        instrumentRoomTerm: String(type),
        mappingNote: null,
    };
}

interface FieldPick {
    readonly value: number;
    readonly regulated: boolean;
    readonly tier: HabitabilityMatchTier;
    readonly standard: HabitabilityStandard;
    readonly provenance: RoomMinimumProvenance;
}

function pickField(
    chain: readonly Rung[],
    type: RoomType,
    field: 'minAreaM2' | 'minShortSideM',
): FieldPick {
    for (const rung of chain) {
        for (const std of rung.standards) {
            const entry = (std.rooms as Partial<Record<string, RoomMinimum>>)[type];
            if (!entry) continue;              // this instrument is silent on this room
            const v = entry[field];
            if (v === null || v === undefined) continue;  // silent on THIS field — keep climbing
            return {
                value: v,
                regulated: true,
                tier: rung.tier,
                standard: std,
                provenance: entry.provenance,
            };
        }
    }
    const base = baselineFor(type);
    const bv = base[field];
    return {
        // The baseline's own value; 0 only where ROOM_RULES itself declares "no minimum
        // enforced" (the corridor). Never invented.
        value: typeof bv === 'number' ? bv : 0,
        regulated: false,
        tier: 'pryzm-baseline',
        standard: PRYZM_BASELINE,
        provenance: base.provenance,
    };
}

/**
 * THE ANSWER. Total: every RoomType resolves, and every resolution carries the
 * instrument (or the explicit absence of one) behind each of its two numbers.
 *
 * `binding` ABSENT ⇒ the named PRYZM baseline with `matchTier: 'pryzm-baseline'`.
 * That is byte-identical to the pre-L-4400 behaviour, which is exactly why the
 * jurisdiction is threaded as an OPTIONAL argument: an un-migrated call site keeps
 * today's numbers and gains the honest label, and never silently acquires a foreign
 * country's law.
 */
export function resolveRoomMinimum(
    type: RoomType,
    binding?: HabitabilityBinding | null,
): ResolvedRoomMinimum {
    const chain = habitabilityChain(binding);
    const area = pickField(chain, type, 'minAreaM2');
    const side = pickField(chain, type, 'minShortSideM');
    // The reported tier is the STRONGER of the two — a room whose area is regulated
    // and whose width is not is a regulated room with a defaulted width, not a
    // defaulted room. The two booleans carry the detail; this is the headline.
    const tier: HabitabilityMatchTier = area.regulated
        ? area.tier
        : side.regulated
          ? side.tier
          : 'pryzm-baseline';
    const lead = area.regulated ? area.standard : side.regulated ? side.standard : PRYZM_BASELINE;
    return {
        roomType: type,
        minAreaM2: area.value,
        minShortSideM: side.value,
        areaIsRegulated: area.regulated,
        shortSideIsRegulated: side.regulated,
        matchTier: tier,
        standardId: lead.standardId,
        displayName: lead.displayName,
        provenance: area.provenance,
        shortSideProvenance: side.provenance,
    };
}

/**
 * The two numbers the layout ALGORITHM applies, with nothing else attached — the hot
 * path for allocators that size hundreds of candidate rectangles per run.
 *
 * ⚠ USE THIS TO SIZE, NEVER TO EXPLAIN. Any sentence shown to a user must come from
 * {@link resolveRoomMinimum} + {@link provenanceSentence}; a bare number in a refusal
 * is the L-4210 defect reintroduced, one layer down.
 */
export function roomMinima(
    type: RoomType,
    binding?: HabitabilityBinding | null,
): { readonly minAreaM2: number; readonly minShortSideM: number } {
    const r = resolveRoomMinimum(type, binding);
    return { minAreaM2: r.minAreaM2, minShortSideM: r.minShortSideM };
}

const BINDING_PHRASE: Record<string, string> = {
    mandatory: 'a mandatory requirement',
    conditional: 'a standard that binds only where the local planning authority has adopted it',
    guidance: 'guidance, not a legal requirement',
};

/**
 * THE SENTENCE THAT MUST ACCOMPANY THE NUMBER.
 *
 * ⭐ THIS IS THE FOUNDER'S ACTUAL COMPLAINT, ANSWERED. The product printed
 * *"master 9.3 m² vs 12 m² minimum"* over a Barcelona room, and the word "minimum"
 * carried the authority of a law that did not apply. Every refusal that names a
 * number must now name what imposes it — or say plainly that nothing does.
 *
 * The `pryzm-default` arm is the load-bearing one. It states the negative twice: the
 * figure is PRYZM's, AND no habitability standard is loaded for the place. A reader
 * cannot come away thinking a regulation was consulted.
 */
export function provenanceSentence(r: ResolvedRoomMinimum, placeLabel?: string | null): string {
    const where = (placeLabel ?? '').trim();
    if (!r.areaIsRegulated) {
        const scope = where.length > 0 ? where : 'this location';
        return (
            `⚠ The ${r.minAreaM2.toFixed(1)} m² figure is a PRYZM engineering default, NOT a regulation ` +
            `of ${scope}. No habitability standard is loaded for ${scope}, so PRYZM is not telling you ` +
            `what the law there requires.`
        );
    }
    const p = r.provenance;
    const art = p.article ? ` ${p.article}` : '';
    const bind = BINDING_PHRASE[p.bindingness] ?? p.bindingness;
    const unverified =
        p.confidence === 'instrument-cited'
            ? ' ⚠ This value is cited from the named instrument but has NOT been verified against its ' +
              'primary text in this repo — treat it as a candidate, not a compliance determination.'
            : '';
    const widthNote = r.shortSideIsRegulated
        ? ''
        : ` (The ${r.minShortSideM.toFixed(2)} m minimum width applied alongside it is a PRYZM default — ` +
          'this instrument states no width for this room.)';
    return (
        `Minimum ${r.minAreaM2.toFixed(1)} m² for "${roomTermOf(r)}" under ${p.instrument}${art} ` +
        `(${p.instrumentDate}) — ${bind} in ${r.displayName}.${widthNote}${unverified}`
    );
}

/**
 * The instrument's OWN word for the room ("dormitorio", "habitació", "single
 * bedroom"), so the sentence quotes the ordinance rather than PRYZM's internal
 * vocabulary. Falls back to the RoomType, never to another instrument's term.
 */
function roomTermOf(r: ResolvedRoomMinimum): string {
    const std =
        HABITABILITY_STANDARDS.find((x) => x.standardId === r.standardId) ?? PRYZM_BASELINE;
    const entry = (std.rooms as Partial<Record<string, RoomMinimum>>)[r.roomType];
    return entry?.instrumentRoomTerm ?? String(r.roomType);
}

/**
 * A one-line label for the resolved authority, for a card/tooltip that has no room
 * for the full sentence. Still never claims law it does not have.
 */
export function authorityLabel(r: ResolvedRoomMinimum): string {
    return r.areaIsRegulated
        ? `${r.displayName} (${r.provenance.confidence === 'primary-in-repo' ? 'verified' : 'cited, unverified'})`
        : 'PRYZM default — no regulation loaded';
}
