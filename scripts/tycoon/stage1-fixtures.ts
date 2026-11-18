// npx esbuild scripts/tycoon/stage1-fixtures.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/tycoon-stage1-fixtures.mjs
// node /tmp/tycoon-stage1-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
import { chooseCard } from '../../src/lib/tycoon/sim/cycle'
import { shipProject } from '../../src/lib/tycoon/sim/project'
import { DISCIPLINES } from '../../src/lib/tycoon/sim/types'

const dir = process.argv[2] ?? '/tmp/tycoon-stage1-fixtures'
mkdirSync(dir, { recursive: true })
const state = stage0Fixture('one-floor')
state.plan = { clarity: 90, cards: [{ kind: 'polish', id: 'polish', why: 'Reduce open bugs' }] }
if (!chooseCard(state, 0).ok) throw new Error('Fixture could not choose a release')
const office = state.offices[0]
for (const discipline of DISCIPLINES) office.project!.progress[discipline] = office.project!.target[discipline]
state.day += 30
if (!shipProject(state, undefined, office.id).ok) throw new Error('Fixture could not complete a release')
state.events = []
state.plan = { clarity: 90, cards: [
  { kind: 'polish', id: 'polish', why: 'Reduce open bugs' },
  { kind: 'item', id: 'ci_pipeline', why: 'Improve deployment speed' },
] }
writeFileSync(join(dir, 'business.json'), JSON.stringify(state))
console.log(`Wrote synthetic Stage 1 fixture to ${dir}`)
