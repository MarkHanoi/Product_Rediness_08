// §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — the ONE place that names the id of the
// auto-opening a stair punches in the slab above it.
//
// CreateStairCommand.createAutoOpening() WRITES this opening; DeleteStairCommand
// REMOVES it. The two commands are different instances with no shared field, so the
// only link between "the hole the create punched" and "the hole the delete heals" is
// this id convention. If the two sides ever disagreed on the format, delete would
// "remove" an opening that was never named the same — and the hole would stay in the
// floor forever, which is exactly the defect this ticket closes. So the convention
// gets one home and both sides import it.
export function stairAutoOpeningId(stairId: string): string {
    return `opening-stair-${stairId}`;
}
