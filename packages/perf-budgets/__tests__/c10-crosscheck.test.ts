/**
 * C10 §1 CROSS-CHECK — the anti-drift gate.
 *
 * Parses the NFT table out of
 * `docs/02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md` §1 at test
 * time and asserts, cell by cell, that `NFT_TARGETS` reproduces it.
 *
 * WHY THIS EXISTS (W5-1, 2026-08-11): four mutually inconsistent NFT target
 * sets had accumulated — C10, STR-03 §5.1, this package's previous 9-row list
 * (anchored to a DELETED doc), and every bench's own header comment (also
 * anchored to a deleted doc). Benches asserted their header numbers, so an NFT
 * could pass its own assertion while missing C10 by 40×. Restating the numbers
 * in prose is what allowed that. This test makes restatement impossible: the
 * contract is parsed, not remembered.
 *
 * If this test fails, the fix is NEVER to edit the expectation. Either C10
 * changed deliberately (update NFT_TARGETS to match) or something drifted
 * (revert it).
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NFT_TARGETS, nft, nftLimit } from '../src/nft-targets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const C10 = resolve(
  REPO_ROOT,
  'docs/02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md',
);

interface C10Row {
  nft: number;
  name: string;
  target: string;
  benchFile: string;
}

/** Parse the `| # | NFT | Target | Bench file |` table out of C10 §1. */
function parseC10Table(md: string): C10Row[] {
  const rows: C10Row[] = [];
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 4) continue;
    const n = Number(cells[0]);
    if (!Number.isInteger(n) || n < 1) continue;
    // The bench-file cell is backtick-quoted in the contract.
    const benchFile = cells[3].replace(/`/g, '').replace(/\s*\(.*\)\s*$/, '').trim();
    if (!/\.(bench\.ts|spec\.ts)$/.test(benchFile)) continue;
    rows.push({ nft: n, name: cells[1], target: cells[2], benchFile });
  }
  return rows;
}

describe('C10 §1 cross-check', () => {
  it('the C10 contract file exists and contains a parseable NFT table', () => {
    expect(existsSync(C10)).toBe(true);
    expect(parseC10Table(readFileSync(C10, 'utf8')).length).toBeGreaterThan(0);
  });

  it('NFT_TARGETS has exactly one row per C10 §1 row, in order', () => {
    const c10 = parseC10Table(readFileSync(C10, 'utf8'));
    expect(NFT_TARGETS.map((t) => t.nft)).toEqual(c10.map((r) => r.nft));
  });

  it('every NFT name, target and bench-file cell matches C10 §1 verbatim', () => {
    const c10 = parseC10Table(readFileSync(C10, 'utf8'));
    for (const row of c10) {
      const t = nft(row.nft);
      expect(
        { nft: t.nft, name: t.c10Nft, target: t.c10Target, benchFile: t.c10BenchFile },
        `NFT ${row.nft} drifted from C10 §1`,
      ).toEqual(row);
    }
  });
});

describe('NFT_TARGETS — internal integrity', () => {
  it('ids are unique kebab-case', () => {
    const ids = NFT_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('every not-yet-measurable row states what blocks it', () => {
    for (const t of NFT_TARGETS) {
      if (t.measurability !== 'not-yet-measurable') continue;
      expect(t.blockedBy, `NFT ${t.nft} is not-yet-measurable with no blockedBy`).toBeTruthy();
      expect(t.blockedBy!.length).toBeGreaterThan(30);
    }
  });

  it('every measured row has a numeric budget and an existing bench file', () => {
    for (const t of NFT_TARGETS) {
      if (t.measurability !== 'measured') continue;
      expect(typeof t.limit, `NFT ${t.nft} measured but limit is not numeric`).toBe('number');
      expect(t.benchPath, `NFT ${t.nft} measured but has no bench path`).toBeTruthy();
      expect(
        existsSync(resolve(REPO_ROOT, t.benchPath!)),
        `NFT ${t.nft} bench file missing: ${t.benchPath}`,
      ).toBe(true);
    }
  });

  it('nftLimit() REFUSES to hand a contract budget to a proxy measurement', () => {
    for (const t of NFT_TARGETS) {
      if (t.measurability === 'measured') {
        expect(nftLimit(t.nft)).toBe(t.limit);
      } else {
        expect(() => nftLimit(t.nft), `NFT ${t.nft} should refuse`).toThrow(
          /NOT-YET-MEASURABLE/,
        );
      }
    }
  });

  it('the C10 bench-file cell agrees with the bench path, when a path exists', () => {
    for (const t of NFT_TARGETS) {
      if (!t.benchPath) continue;
      expect(t.benchPath.endsWith(t.c10BenchFile), `NFT ${t.nft}`).toBe(true);
    }
  });
});
