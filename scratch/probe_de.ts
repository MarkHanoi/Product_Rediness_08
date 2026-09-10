import { resolveParcelJurisdiction, resolveParcelCandidates } from '../packages/site-parcel-data/src/index.ts';
const pts: Array<[string, number, number]> = [
  ['Delaware demo (Lewes)', 38.781987, -75.089744],
  ['Wilmington DE', 39.7447, -75.5484],
  ['Dover DE', 39.1582, -75.5244],
];
for (const [name, lat, lon] of pts) {
  const j: any = resolveParcelJurisdiction(lat, lon);
  const c: any[] = resolveParcelCandidates(lat, lon) as any[];
  console.log(`\n== ${name} (${lat},${lon})`);
  console.log('  WINNER:', j.regionCode, '|', j.kind, '|', j.providerId ?? '-', '|', j.proxyPath ?? '-');
  console.log('  CANDIDATES:', c.map((x)=>`${x.regionCode}:${x.kind}`).join(', ') || '(none)');
}
