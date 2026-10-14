/** Capacity/source closure at each realm; does not estimate production time. */
import { auditReachability } from './progression-reachability.mjs'
import { ASCEND_REALM_INDEX } from '../src/data/realms.js'
const ceiling = process.argv[2] == null ? ASCEND_REALM_INDEX : Number(process.argv[2])
const { state, derived, sources, ...result } = auditReachability(ceiling)
console.log(JSON.stringify(result, null, 2))
if (!result.settled || state.realm < ceiling || (ceiling === ASCEND_REALM_INDEX && result.blocked.length)) process.exitCode = 1
