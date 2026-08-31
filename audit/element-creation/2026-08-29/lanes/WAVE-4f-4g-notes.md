# WAVE 4f + 4g — measurements (live, appended as measured)

## PRE-EXISTING REFUTATIONS (measured at HEAD, before any edit)

`tools/ga-gate/mirror-debt.json` + the handlers themselves already classify three of the
verbs the audit rows named as "writes the store, reports success, renders nothing":

| verb | audit claim | MEASURED at HEAD | verdict |
|---|---|---|---|
| roof.move | unmirrored, silently succeeds | `MoveRoofHandler` canExecute REFUSES (`ROOF_MOVE_UNREACHABLE`, MoveRoof.ts:71) · mirror-debt kind `refuses`, "MUST NOT acquire a mirror" | **REFUTED** |
| column.move | idem | `MoveColumnHandler` canExecute REFUSES (MoveColumn.ts:71) · mirror-debt kind `refuses` | **REFUTED** |
| beam.move | idem | `MoveBeamHandler` canExecute REFUSES (MoveBeam.ts:71) · mirror-debt kind `refuses` | **REFUTED** |
| roof.setPitch | unmirrored, silently succeeds | mirror-debt: MEASURED AND DELIBERATELY NOT MIRRORED — `grep -n "pitch" packages/geometry-roof/src/RoofTypes.ts` -> 0 hits | **REFUTED as a fix target** |

Command: `node -e "const j=require('./tools/ga-gate/mirror-debt.json'); ..."` (156 rows) and
`grep -n canExecute -A12 plugins/{roof,column,beam}/src/handlers/Move*.ts`.

So B2-ROOF-03's "6 of 12" is **4 of 12** as an actionable set, and B2-COL-02's "2 of 8" is
**1 of 8**, and B2-BEAM-02's "3 of 8" is **2 of 8**.
