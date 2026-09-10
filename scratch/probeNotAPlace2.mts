import { isNotAPlace } from '../packages/ai-host/src/intents/SpatialScopeTail.js';
for (const s of ['all walls','every wall segment','the middle of every wall segment','the middle of the wall',
                 'the walls of the kitchen','the kitchen','block b','the top of block b','the outer side of all walls',
                 'the centre of each wall','house 2','south facade']) {
  console.log(`${isNotAPlace(s) ? 'NOT-A-PLACE' : 'IS-A-PLACE '}  "${s}"`);
}
