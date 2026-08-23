# ADR-0363 — An IFC GlobalId is DERIVED from a stable identifier, not stored in a map

> **Date**: 2026-08-23 · **Status**: ACCEPTED · **Lane**: IFCEXP49
> **Contract**: [C25 §3.1](../contracts/C25-IFC-EXPORT-PRODUCTION.md) · **Issue log**: L-8501
> **Related**: [ADR-0362](./ADR-0362-one-ifc-globalid-codec-at-l0-not-a-second-pipeline.md) · [C05](../contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md)

---

## Context

Separately from validity (ADR-0362), the audit found that **neither pipeline had any persistent PRYZM-id → GlobalId mapping, so GlobalIds churned on every export.**

Measured in Pipeline A: **32** `crypto.randomUUID()` sites. Thirteen readers wrote `guid: x.ifcData?.guid ?? crypto.randomUUID()`; `FurnitureReader.ts:35` and `PlumbingReader.ts:40` had no `ifcData` fallback at all and randomised unconditionally. The project, site and building GlobalIds came from `createDefaultIntermediateModel()` — random per export. Every `IfcOpeningElement`, `IfcRelVoidsElement`, `IfcRelFillsElement`, `IfcRelContainedInSpatialStructure`, `IfcRelAggregates`, `IfcPropertySet` and `IfcRelDefinesByProperties` was random per export.

A `GlobalId` is an element's identity across files and across time. If it changes every export:

- round-trip is broken — a re-import cannot recognise anything it exported;
- every downstream reference (a BCF issue, a COBie row, a clash report, a consultant's markup) dangles after the next export;
- federated coordination is impossible, because the same wall is a different object in every issue.

The brief's instruction was: *"decide where the map lives (it must survive save/load) and record it in C25. ⚠ Coordinate with the project-file owner if this needs a snapshot field."*

## The decision

**Do not build the map. Derive the GlobalId from an identifier that is already persistent and already stable — the PRYZM element id.**

```
GlobalId(element) = ifcData.guid            if present and usable
                  = globalIdFromStableKey("el:" + element.id)   otherwise
```

`globalIdFromStableKey` is a pure function: four independently-seeded FNV-1a lanes, each passed through MurmurHash3's `fmix32`, concatenated into 128 bits and encoded with the buildingSMART base64 alphabet.

Relationship entities derive from a namespaced key built from the same stable ids — `opening:<hostId>:<hostedId>`, `relvoids:…`, `relfills:…`, `relcontained:<storeyId>`, `relaggregates:<key>`, `pset:<ownerKey>:<psetName>`. The namespace prefixes are what stop an element and its opening colliding.

## Why a derivation beats a map

This is a **deliberate refusal of the brief's framing**, and the reasoning is the load-bearing part of this ADR.

A stored map is a second source of truth for a fact that is already determined. It must be:

- **persisted** — a new field in the project file, so a schema change and a migration;
- **migrated** — every existing project has no map, so every element in every saved project would get a fresh GlobalId on first export anyway, which is the exact defect;
- **garbage-collected** — deleted elements leave entries that grow without bound;
- **kept consistent under collaboration** — two clients minting for the same new element must agree, so the map becomes CRDT state;
- **and it is wrong the moment it is not saved.** A crash between "mint" and "save" silently re-mints on the next export. The failure is invisible.

A derivation has none of that. There is no state to lose, no migration, no GC, no merge, and two clients derive the same value without communicating. It is stable **by construction** rather than by successful bookkeeping.

The cost is one real constraint, stated plainly: **the lane seeds and the key namespaces are a persistence format.** Changing either silently re-mints every derived GlobalId in every project. `packages/schemas/__tests__/ifcGlobalId.test.ts` carries a frozen-vector guard saying so, and `ifcIdentity.ts` marks the namespace strings `⛔ These strings are a persistence format`.

An element that carries a real `ifcData.guid` — anything imported from an IFC file — keeps it verbatim. That is what preserves upstream identity, and it is asserted on the emitted file, not on a return value.

## Consequences

- **No project-file change was needed**, so no coordination with the project-file owner was required. This is the practical payoff of the refusal.
- `ExportElement.guid` becomes optional and honest: it means *"the IFC identity this element already carries"*, not *"a GUID someone minted at read time"*.
- Stability is now testable and tested: two exports of an unchanged model produce byte-identical GlobalIds across elements **and** relationships and psets — the latter being the half a naive element-only check would have missed, since most of the file's GlobalIds belong to relationships.
- ⚠ **A renamed or re-created element gets a new GlobalId**, because its PRYZM id changed. That is correct — it is a different object — but it means an element id must never be regenerated for a surviving element. `packages/schemas/src/factory/createId.ts` is the authority for that and is unchanged by this ADR.
- ⚠ **`createIfcMetadata()` (`CoreElement.ts`) still mints `crypto.randomUUID()`** into `ifcData.guid`. That is now harmless — the coercion encodes it, and it IS persisted so it is stable — but it means two elements' identities come from two different mechanisms. Unifying them is deferred, not done.
