import { FIT_TAKEOFF } from '@/lib/tycoon/sim/balance'
import { fitRange, fitWord } from '@/lib/tycoon/sim/fit'
import { useGame } from './context'

const WORDS = { cold: 'cold', lukewarm: 'lukewarm', warm: 'warm', hot: 'hot: ready to take off' } as const

/**
 * Product–market fit as the studio can read it: a range on a bar from 0 to 100, as narrow as its eye for users is
 * sharp, with the line a product takes off at. `rangeKey` fixes where the true fit sits in the range for a release.
 */
export function FitMeter({ fit, rangeKey, label = 'Fit', taken = false }: { fit: number; rangeKey: number; label?: string; taken?: boolean }) {
  const state = useGame()
  const { low, high } = fitRange(state, fit, rangeKey)
  // Name it by the middle of what the studio can tell, not by the true value.
  const word = fitWord((low + high) / 2)
  const tone = word === 'hot' ? 'good' : word === 'cold' ? 'bad' : word === 'warm' ? 'warn' : 'muted'
  return (
    <div className="fit-meter" title={`Takes off at ${FIT_TAKEOFF}, in a market that is neither cold nor crowded. Your read of it gets sharper as your analysis does.`}>
      <span className="fit-label">
        {label} <strong>{low === high ? low : `${low}–${high}`}</strong> <span className={tone}>{taken && word === 'hot' ? 'hot' : WORDS[word]}</span>
      </span>
      <span className="fit-track" aria-hidden="true">
        <span className={`fit-range ${tone}`} style={{ left: `${low}%`, width: `${Math.max(1, high - low)}%` }} />
        <span className="fit-line" style={{ left: `${FIT_TAKEOFF}%` }} />
      </span>
    </div>
  )
}
