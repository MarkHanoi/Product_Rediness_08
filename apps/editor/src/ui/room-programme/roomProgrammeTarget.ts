// §ROOM-PROGRAMME-TARGET (founder ruling 2026-09-11 — Site-panel restructure, Section 4 · C115 §8.1
// `C115-181` · C114 §12 (room ⊂ level) · C84 EI-9 · L-13317) — WHICH level envelope the room
// programme resolves into.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ FOUNDER: *"Room library, relationship graph, and the plan it resolves to — per building and
// level."* Two selectors choose the BUILDING (a massing group, or the ungrouped envelopes) and the
// STOREY that the plan below resolves into and that "Place envelopes in 3D" seats its rooms within.
// ═══════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ ONE PICKER, NOT TWO. The selectors never pick an envelope themselves: they NARROW the level
// envelopes handed to `pickHostLevelEnvelope`, the ONE picker `render()` and `place()` already share.
// Every refusal it states — no level envelope · two contend for one storey — is therefore still
// stated in its own words, about exactly what the reader chose. Room envelopes are never filtered:
// `roomEnvelopesWithin` must see all of them to count what a placement would replace.
//
// ⭐ THE DEFAULT IS TODAY'S RULE. No building chosen + "Active storey" hands the picker the
// UN-narrowed set and the active storey — the very array and the very storey it received before the
// selectors existed — so a reader who never touches them sees no change at all.
//
// PURE: no store, no bus, no DOM, no clock. Never throws. P6 — dispatches nothing.

import { trace } from '@opentelemetry/api';
import { readMassingGroupRef } from '../site/massingGroupRoster';
import {
  pickHostLevelEnvelope,
  type LevelEnvelopePick,
  type SpaceEnvelopeRecordLike,
} from './roomEnvelopePlan';

const _tracer = trace.getTracer('pryzm.roomProgramme.target');

/** The ungrouped bucket's key. Never a real group id — those are minted ids. */
export const PROGRAMME_UNGROUPED_BUILDING = '__ungrouped__';

/** What the two selectors hold. `null` means "every building" / "follow the active storey". */
export interface ProgrammeTarget {
  readonly buildingKey: string | null;
  readonly levelId: string | null;
}

/** Today's rule: every building, the active storey. */
export const PROGRAMME_TARGET_DEFAULT: ProgrammeTarget = Object.freeze({ buildingKey: null, levelId: null });

export interface ProgrammeStoreyOption {
  readonly levelId: string;
  /** The level envelope's own name (e.g. `ENV_GROUND_001`), else its storey id. */
  readonly label: string;
  /** Level envelopes of this building on the storey — more than one is the picker's `ambiguous` arm. */
  readonly envelopeCount: number;
}

export interface ProgrammeBuildingOption {
  readonly key: string;
  readonly label: string;
  readonly storeys: readonly ProgrammeStoreyOption[];
}

const isLevel = (r: SpaceEnvelopeRecordLike): boolean => r.role === 'level';

/** The building a level envelope belongs to — its massing group, else the ungrouped bucket. */
function buildingOf(r: SpaceEnvelopeRecordLike): { key: string; label: string } {
  const g = readMassingGroupRef(r);
  return g !== null
    ? { key: g.id, label: g.label }
    : { key: PROGRAMME_UNGROUPED_BUILDING, label: 'Ungrouped envelopes' };
}

/**
 * Every building that holds at least one level envelope, each with its storeys, in the store's own
 * order — never re-ranked, so the list does not reshuffle under the reader between two paints.
 */
export function listProgrammeBuildings(
  records: readonly SpaceEnvelopeRecordLike[],
): readonly ProgrammeBuildingOption[] {
  const span = _tracer.startSpan('pryzm.roomProgramme.listProgrammeBuildings');
  try {
    const byKey = new Map<string, { label: string; storeys: Map<string, { label: string; count: number }> }>();
    for (const r of records) {
      if (!isLevel(r) || typeof r.levelId !== 'string' || r.levelId.length === 0) continue;
      const b = buildingOf(r);
      let entry = byKey.get(b.key);
      if (!entry) {
        entry = { label: b.label, storeys: new Map() };
        byKey.set(b.key, entry);
      }
      const s = entry.storeys.get(r.levelId);
      if (s) s.count += 1;
      else entry.storeys.set(r.levelId, { label: (r.name ?? '').trim() || r.levelId, count: 1 });
    }
    const out = [...byKey.entries()].map(([key, v]) => ({
      key,
      label: v.label,
      storeys: [...v.storeys.entries()].map(([levelId, s]) => ({ levelId, label: s.label, envelopeCount: s.count })),
    }));
    span.setAttribute('pryzm.roomProgramme.buildings', out.length);
    return out;
  } catch (e) {
    console.warn('[room-programme] §ROOM-PROGRAMME-TARGET building list failed (non-fatal):', e);
    return [];
  } finally {
    span.end();
  }
}

/**
 * The records the ONE picker should see for `target`: level envelopes narrowed to the chosen
 * building and storey; every other record (the rooms) passed through untouched.
 */
export function narrowToProgrammeTarget(
  records: readonly SpaceEnvelopeRecordLike[],
  target: ProgrammeTarget,
): readonly SpaceEnvelopeRecordLike[] {
  const span = _tracer.startSpan('pryzm.roomProgramme.narrowToProgrammeTarget');
  try {
    // ⭐ The default returns the SAME array — today's pick, not a copy of it.
    if (target.buildingKey === null && target.levelId === null) return records;
    return records.filter((r) => {
      if (!isLevel(r)) return true;
      if (target.buildingKey !== null && buildingOf(r).key !== target.buildingKey) return false;
      if (target.levelId !== null && r.levelId !== target.levelId) return false;
      return true;
    });
  } finally {
    span.end();
  }
}

/**
 * ⭐ THE ONE CALL `render()` and `place()` both make — so the plan on screen and the envelopes
 * placed from it can never be resolved against two different storeys.
 */
export function pickProgrammeHost(
  records: readonly SpaceEnvelopeRecordLike[],
  target: ProgrammeTarget,
  activeLevelId: string | null,
): LevelEnvelopePick {
  const span = _tracer.startSpan('pryzm.roomProgramme.pickProgrammeHost');
  try {
    return pickHostLevelEnvelope(narrowToProgrammeTarget(records, target), target.levelId ?? activeLevelId);
  } finally {
    span.end();
  }
}

/**
 * A target whose building or storey no longer exists (deleted, dissolved, undone) drops back to the
 * default for the part it lost — never a selector pointing at nothing, never a silent stale pick.
 * Returns the SAME object when nothing was lost, so callers can compare by identity.
 */
export function reconcileProgrammeTarget(
  target: ProgrammeTarget,
  buildings: readonly ProgrammeBuildingOption[],
): ProgrammeTarget {
  const span = _tracer.startSpan('pryzm.roomProgramme.reconcileProgrammeTarget');
  try {
    if (target.buildingKey === null && target.levelId === null) return target;
    const b = target.buildingKey !== null ? buildings.find((x) => x.key === target.buildingKey) : undefined;
    const buildingKey = b !== undefined ? target.buildingKey : null;
    const pool = b !== undefined ? b.storeys : buildings.flatMap((x) => x.storeys);
    const levelId = target.levelId !== null && pool.some((s) => s.levelId === target.levelId)
      ? target.levelId
      : null;
    return buildingKey === target.buildingKey && levelId === target.levelId ? target : { buildingKey, levelId };
  } finally {
    span.end();
  }
}
