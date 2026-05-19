// Shared types for the PRYZM 1 → PRYZM 2 sunset migration tool.
//
// Spec: SPEC-26 §1 (.pryzm v1 archive shape) + SPEC-27 §4.3 + ADR-0031.
//
// These are *intentionally minimal*: the v0.1 CLI ships with first-cut
// support for the Tier 1 element families (walls, levels, doors).  Tier 2
// families (curtain walls, stairs, columns, beams, handrails, ceilings,
// roofs, grids, slabs, windows) land in v0.2 once parity bench fixtures
// from S58 + S59 land per the Phase 3-B carry table.

/** Subset of the legacy PRYZM 1 JSON snapshot consumed by the converter.
 *  Field names mirror the on-disk keys produced by `src/persistence/
 *  ProjectExporter.ts` (PRYZM 1) — do not rename without a migrator. */
export interface Pryzm1Snapshot {
  readonly schemaVersion: number;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly walls?: readonly Pryzm1Wall[];
  readonly levels?: readonly Pryzm1Level[];
  readonly doors?: readonly Pryzm1Door[];
}

export interface Pryzm1Wall {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number; readonly z: number };
  readonly end: { readonly x: number; readonly y: number; readonly z: number };
  readonly height: number;
  readonly thickness: number;
  readonly levelId?: string;
}

export interface Pryzm1Level {
  readonly id: string;
  readonly name: string;
  readonly elevation: number;
}

export interface Pryzm1Door {
  readonly id: string;
  readonly hostWallId: string;
  readonly position: number; // 0..1 along the wall baseline
  readonly width: number;
  readonly height: number;
}

/** PRYZM 2 archive payload shape per SPEC-26 §1.  The actual on-disk
 *  format is a ZIP with `manifest.json` + `events.msgpack` + asset blobs;
 *  this type is the *logical* shape returned by the converter, ready for
 *  the SPEC-26 packer to serialise.  v0.1 emits the JSON intermediate
 *  only; the packer integration lands in v0.2. */
export interface Pryzm2Archive {
  readonly formatVersion: 1;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly migratedFrom: 'pryzm-1';
    readonly migratedAt: string;
  };
  readonly events: readonly Pryzm2Event[];
  readonly migrationReport: Pryzm2MigrationReport;
}

/** Append-only event log per SPEC-02 §2.  Each PRYZM 1 element becomes
 *  one or more `*.create` events with synthesised audit metadata. */
export interface Pryzm2Event {
  readonly type: string; // e.g. 'wall.create', 'level.create', 'door.create'
  readonly clientId: string;
  readonly timestamp: number; // ms since epoch
  readonly causalSeq: number; // monotonic per converter run
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Per-run report — what was converted, what was skipped, why. */
export interface Pryzm2MigrationReport {
  readonly inputElementCounts: Readonly<Record<string, number>>;
  readonly outputEventCounts: Readonly<Record<string, number>>;
  readonly skipped: readonly { readonly kind: string; readonly id: string; readonly reason: string }[];
  readonly warnings: readonly string[];
  readonly tier2Deferred: readonly string[];
}

export interface ConvertOptions {
  /** Stable client id stamped on every emitted event.  Defaults to
   *  `pryzm1-sunset-cli` so converter test fixtures are byte-stable. */
  readonly clientId?: string;
  /** Frozen wall-clock (ms) for `migratedAt` + per-event `timestamp`.
   *  Test fixtures pass this so output is reproducible. */
  readonly fixedNow?: number;
}
