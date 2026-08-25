# Facade-reconstruction probes (evidence, not tests)

Session probes from the 2026-08-24/25 photo-facade lanes (L-10930–L-11225). They are the
evidence base cited by `docs/03-execution/lanes/REALPHOTO73-FACADE-REAL-PHOTO-FIX-PLAN.md`
and the CONF72 diagnoses (L-11220), kept so a number in those documents can be re-derived.

- Not part of the package build (`tsconfig.json` includes `src/**` only) and not discovered by vitest.
- They were written to run from the package root; imports were rewritten to `../src/` when moved
  here. Run: `cd packages/facade-reconstruction && node ../../node_modules/tsx/dist/cli.mjs probes/<name>.mts`.
- `probe-rp73-*` — REALPHOTO73 (H1–H5 variants of case M). `probeL60*` — the L-11060 series.
  `probe.mts`…`probe6.mts`, `probeOverlay`, `probeSym` — earlier lattice / symmetry probes.
- ⚠ They read the corpus as it was at their session; if the corpus moves, a probe may stop
  matching the shipped pipeline — that is a finding, not a failure to hide.
