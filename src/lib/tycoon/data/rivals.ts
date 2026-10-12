import type { ProjectSize } from '@/lib/tycoon/sim/types'

export interface RivalSeed {
  name: string
  /** The quality they ship at, roughly; it creeps up over the years. */
  skill: number
  reputation: number
  /** Product types they like to build. */
  focus: readonly string[]
  /** Products they already have on the market when the game begins. */
  products: number
  /** The biggest projects they take on at first. */
  size: ProjectSize
  /** Income per day from business outside the shared markets (services, licensing) at the start... */
  business: number
  /** ...and how much it grows a year. */
  growth: number
}

/** The competition: from an established giant down to a newcomer about as small as you. */
export const RIVALS: readonly RivalSeed[] = [
  { name: 'Bluebird Labs', skill: 74, reputation: 65, focus: ['web_app', 'saas_platform', 'cloud_platform'], products: 4, size: 'large', business: 1200, growth: 0.32 },
  { name: 'Pixelforge', skill: 71, reputation: 55, focus: ['game', 'mobile_app'], products: 4, size: 'large', business: 800, growth: 0.3 },
  { name: 'Northwind Software', skill: 66, reputation: 45, focus: ['dev_tool', 'web_app', 'saas_platform'], products: 3, size: 'medium', business: 600, growth: 0.33 },
  { name: 'Hexagon Apps', skill: 61, reputation: 30, focus: ['mobile_app', 'web_app', 'game'], products: 2, size: 'medium', business: 300, growth: 0.35 },
  // A newcomer that rides the AI wave when it comes.
  { name: 'Quanta', skill: 58, reputation: 12, focus: ['ai_product', 'dev_tool', 'web_app'], products: 1, size: 'small', business: 150, growth: 0.55 },
]
