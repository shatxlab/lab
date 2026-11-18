// Test-only bridge: resume the real simulation policy from an exported career, preserving its entire ledger.
// Produces a supported import file; never writes browser/player storage or invents cash/achievements/endings.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { deserializeCareerSave, serializeCareerSave } from '../../src/lib/tycoon/career-save'
import { deserialize, serialize } from '../../src/lib/tycoon/sim/state'
const [input, output, mode = 'offer'] = process.argv.slice(2)
const checked = deserializeCareerSave(readFileSync(input, 'utf8'))
if (!checked.ok) throw new Error(checked.reason)
const save = checked.value
writeFileSync(`${output}.engine-input.json`, serialize(save.game))
execFileSync(process.execPath, ['/tmp/tycoon-stage7-bot.mjs', '1', mode === 'offer' ? '12' : '.25', 'quiet'], {
  env: { ...process.env, BOT_RESUME: `${output}.engine-input.json`, FINAL_SAVE: `${output}.engine-output.json`,
    BOT_POLICY: 'observed', BOT_EXIT: mode === 'offer' ? 'sold' : '', BOT_STOP_AT_OFFER: mode === 'offer' ? '1' : '', BOT_STOP_AT_IPO: '' }, stdio: 'pipe', timeout: 120000,
})
const game = deserialize(readFileSync(`${output}.engine-output.json`, 'utf8'))
if (!game || game.gameOver || (mode === 'offer' && !game.exit.pending)) throw new Error('Policy did not reach a live genuine offer/operating company')
save.game = game
const encoded = serializeCareerSave(save)
if (!encoded.ok) throw new Error(encoded.reason)
writeFileSync(output, encoded.value)
console.log(`Actual simulated ${mode}: company ${game.chapter}, day ${game.day}, cash ${Math.round(game.money)}`)
