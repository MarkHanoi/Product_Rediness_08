import { isNotAPlace } from '../packages/ai-host/src/intents/SpatialScopeTail.js';
for (const s of ['my design','this design','the envelope','my drawing','my envelope','the massing',
                 'all walls','the middle of every wall segment',
                 'the kitchen','block b','my kitchen','house 2','the walls of the kitchen']) {
  console.log(`${isNotAPlace(s) ? 'NOT-A-PLACE' : 'IS-A-PLACE '}  "${s}"`);
}
