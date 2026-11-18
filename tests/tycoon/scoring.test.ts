import { describe, expect, it } from 'vitest'
import { OVERSHOOT_CAP, QUALITY_BASE } from '@/lib/tycoon/sim/balance'
import { projectTarget } from '@/lib/tycoon/sim/project'
import { computeQuality, isReady } from '@/lib/tycoon/sim/scoring'
import { DISCIPLINES, emptySkills, type Project } from '@/lib/tycoon/sim/types'

function makeProject(productTypeId: string, featureIds: string[], fraction: number): Project {
  const target = projectTarget(productTypeId, featureIds)
  const progress = emptySkills()
  for (const d of DISCIPLINES) progress[d] = target[d] * fraction
  return {
    id: 1,
    name: 'Test',
    kind: 'new',
    parentId: null,
    productTypeId,
    size: 'small',
    featureIds,
    target,
    progress,
    startDay: 0,
    readyNotified: false,
    hype: 1,
    alphaOffered: false,
    bugRisk: 1,
    contract: null,
  }
}

describe('computeQuality', () => {
  it('is 0 with no progress and QUALITY_BASE at exactly on-target with suiting features', () => {
    expect(computeQuality(makeProject('web_app', [], 0))).toBe(0)
    expect(computeQuality(makeProject('web_app', ['accounts'], 1))).toBeCloseTo(QUALITY_BASE)
  })

  it('reaches 100 with full overshoot', () => {
    expect(computeQuality(makeProject('web_app', ['accounts'], OVERSHOOT_CAP))).toBeCloseTo(100)
  })

  it('never decreases as progress in any single discipline increases', () => {
    for (const typeId of ['web_app', 'game', 'dev_tool']) {
      for (const d of DISCIPLINES) {
        const project = makeProject(typeId, [], 0.4)
        const start = project.progress[d]
        const end = project.target[d] * OVERSHOOT_CAP
        let previous = computeQuality(project)
        for (let step = 1; step <= 40; step++) {
          project.progress[d] = start + ((end - start) * step) / 40
          const quality = computeQuality(project)
          expect(quality).toBeGreaterThanOrEqual(previous - 1e-9)
          previous = quality
        }
      }
    }
  })

  it('penalises features that do not suit the product type', () => {
    const suiting = computeQuality(makeProject('web_app', ['accounts'], 1))
    const offType = computeQuality(makeProject('web_app', ['multiplayer'], 1))
    expect(offType).toBeLessThan(suiting)
  })

  it('stays within 0..100', () => {
    for (const fraction of [0, 0.3, 1, OVERSHOOT_CAP]) {
      const q = computeQuality(makeProject('game', ['multiplayer', 'payments'], fraction))
      expect(q).toBeGreaterThanOrEqual(0)
      expect(q).toBeLessThanOrEqual(100)
    }
  })
})

describe('isReady', () => {
  it('requires every discipline to reach its target', () => {
    const project = makeProject('web_app', [], 1)
    expect(isReady(project)).toBe(true)
    project.progress.qa = project.target.qa - 0.01
    expect(isReady(project)).toBe(false)
  })
})
