import { expect, it } from 'vitest'
import { getResearch, RESEARCH } from '@/lib/tycoon/data/research'
import { INCIDENT_RELIABILITY_MULTIPLIER } from '@/lib/tycoon/sim/balance'
import { initialiseOperations, assignOperation, standingDay } from '@/lib/tycoon/sim/operations'
import { productService, serviceOutput } from '@/lib/tycoon/sim/services'
import { statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { teamRate } from '@/lib/tycoon/sim/work'
import { toolUpkeep } from '@/lib/tycoon/sim/tools'
import { onCallUnlocked } from '@/lib/tycoon/sim/fixes'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { stage0Fixture } from './stage0-fixtures'

it('preserves every audited saved research ID and completed benefit through a v10 round trip', () => {
  const ids = `ux_research design_system ci_pipeline code_review ml_foundations realtime_stack test_automation beta_program incident_management cloud_infra marketing_dept brand_partnerships marketing_automation payroll_automation recruiting_network user_research product_management audience_study enterprise_sales licensing knowledge_base platform_apis security_practice data_sovereignty agent_frameworks ai_copilots coding_agents spatial_computing ux_research_2 ux_research_3 ci_pipeline_2 ci_pipeline_3 test_automation_2 test_automation_3 brand_partnerships_2`.split(' ')
  expect(RESEARCH.map((n) => n.id).sort()).toEqual(ids.sort())
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  const before = [...s.research.done]
  const raw = JSON.parse(serialize(s))
  raw.version = 10
  delete raw.research.known
  const loaded = deserialize(JSON.stringify(raw))!
  expect(loaded.research.done).toEqual(before)
  for (const id of before) expect(getResearch(id)).toBeDefined()
})

it('keeps CI research and the built deploy tool distinct and additive, with unchanged saved IDs and tool upkeep', () => {
  const s = stage0Fixture('europe'), office = s.offices[0], hit = s.products[0]
  initialiseOperations(s)
  s.research.done = []; hit.built = []
  const baseline = teamRate(s, office)
  s.research.done = ['ci_pipeline']
  expect(teamRate(s, office).engineering / baseline.engineering).toBeCloseTo(1.08)
  expect(teamRate(s, office).design / baseline.design).toBeCloseTo(1)
  hit.built = ['ci_pipeline']
  expect(teamRate(s, office).engineering / baseline.engineering).toBeCloseTo(1.08 * 1.1)
  expect(teamRate(s, office).design / baseline.design).toBeCloseTo(1.1)
  expect(toolUpkeep(s)).toBe(80)
  expect(getResearch('ci_pipeline')!.description).toMatch(/Separate from the built Deploy pipeline/)
  hit.built = ['test_automation']
  expect(statMultiplier(s, 'qaSpeed')).toBe(1)
  s.research.done.push('test_automation')
  expect(statMultiplier(s, 'qaSpeed')).toBe(1.1)
})

it('gives Incident management a real managed-company effect without restoring individual pairs or extra builders', () => {
  const s = stage0Fixture('europe'), office = s.offices[0], p = s.products[0]
  initialiseOperations(s)
  s.research.done = s.research.done.filter((id) => id !== 'incident_management')
  const rate = teamRate(s, office), base = serviceOutput(s, office, 'reliability')
  s.research.done.push('incident_management')
  expect(serviceOutput(s, office, 'reliability')).toBeCloseTo(base * INCIDENT_RELIABILITY_MULTIPLIER)
  expect(teamRate(s, office)).toEqual(rate)
  expect(productService(s, p, 'reliability').provided).toBe(0) // Knowing it is not an assignment.
  assignOperation(s, office.id, { kind: 'standing', productId: p.id, service: 'reliability' })
  p.bugs = 100
  standingDay(s)
  expect(100 - p.bugs).toBeCloseTo(base * INCIDENT_RELIABILITY_MULTIPLIER)
  expect(s.onCall).toBeNull()
  expect(new Set(s.dayWork.map((w) => w.employeeId)).size).toBe(s.dayWork.length)
})

it('retains the legacy incident ability, without applying the managed-output bonus before Operations', () => {
  const s = stage0Fixture('europe'), office = s.offices[0]
  s.research.done = s.research.done.filter((id) => id !== 'incident_management')
  const before = serviceOutput(s, office, 'reliability')
  s.research.done.push('incident_management')
  expect(onCallUnlocked(s)).toBe(true)
  expect(serviceOutput(s, office, 'reliability')).toBe(before)
})
