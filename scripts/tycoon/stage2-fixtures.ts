// Bundle as in stage1-fixtures.ts; synthetic acceptance states, never a player-log reconstruction.
import { mkdirSync, writeFileSync } from 'node:fs'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
import { initialiseOperations, assignOperation } from '../../src/lib/tycoon/sim/operations'
const dir = process.argv[2] ?? '/tmp/tycoon-stage2-fixtures'
mkdirSync(dir, { recursive: true })
for (const name of ['one-floor', 'europe'] as const) {
  const state = stage0Fixture(name)
  initialiseOperations(state)
  state.exit.closed = true
  state.exit.ipoAcknowledged = true
  state.research.done = state.research.done.filter((id) => !['ai_copilots', 'coding_agents'].includes(id))
  if (name === 'europe') {
    assignOperation(state, state.offices[0].id, { kind: 'initiative', productId: state.products[0].id, proposal: { kind: 'polish', id: 'polish' } })
    assignOperation(state, state.offices[1].id, { kind: 'standing', productId: state.products[0].id, service: 'reliability' })
  }
  state.events = []
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(state))
}
