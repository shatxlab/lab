// Generate deterministic browser fixtures, not player data:
//   npx esbuild scripts/tycoon/stage0-fixtures.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/tycoon-stage0-fixtures.mjs
//   node /tmp/tycoon-stage0-fixtures.mjs [output-dir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stage0Fixture, type Stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
const dir = process.argv[2] ?? '/tmp/tycoon-stage0-fixtures'
mkdirSync(dir, { recursive: true })
for (const name of ['cafe', 'one-floor', 'europe', 'large-company', 'ipo', 'continued'] satisfies Stage0Fixture[]) {
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(stage0Fixture(name)))
}
console.log(`Wrote six synthetic save fixtures to ${dir}`)
