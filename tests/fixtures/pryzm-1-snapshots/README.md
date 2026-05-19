# PRYZM 1 fixtures

Real-world snapshots extracted from PRYZM 1 exports. The schemas in
`packages/schemas/src/elements/` MUST validate every fixture in this folder —
this is the mitigation for the "schemas drift silently from PRYZM 1
semantics" risk listed in S01.

Each fixture is a single JSON document keyed by element type:

```json
{ "type": "wall", "id": "wall_01H...", "baseLine": [...], ... }
```

Fixtures are loaded by `packages/schemas/__tests__/round-trip.test.ts`; any
file under `<element>/` is parsed with the matching schema.
